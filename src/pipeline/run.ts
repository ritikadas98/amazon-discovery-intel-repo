import { getEnv } from '../config/env.js';
import { config } from '../config/featureGroups.js';
import { loadMockSignals } from '../sources/mockSignals.js';
import { loadAppStoreSignals } from '../sources/appStore.js';
import { loadPlayStoreSignals } from '../sources/playStore.js';
import { commitSeenIds, filterUnseen, loadSeenIds } from '../sources/dedupe.js';
import { normalize } from './normalize.js';
import { cleanSignals } from '../agents/clean.js';
import { detectRegressions } from './regression.js';
import { synthesize } from '../agents/synthesize.js';
import { aggregateByGroup } from './aggregate.js';
import { calculateRice } from './rice.js';
import { assignWoWDeltas, buildLastWeekLookup } from './wow.js';
import { assessReadiness } from '../agents/readiness.js';
import { formatDigestRow, formatSignalsForSheet } from './format.js';
import { appendRows, readRows } from '../lib/sheets.js';
import { sendEmail } from '../lib/email.js';
import { renderRegressionEmail } from '../templates/regressionEmail.js';
import { renderDigestEmail } from '../templates/digestEmail.js';
import type { GroupSummary, PipelineResult, RawSignal, RunOptions, TopGroupView } from '../types.js';

export async function runPipeline(opts: RunOptions): Promise<PipelineResult> {
  const env = getEnv();
  const recipient = opts.recipient_email;
  const log = (msg: string) => console.log(`[pipeline] ${msg}`);

  log(`Starting run — recipient=${recipient}, mock=${env.USE_MOCK}`);

  // 1. Ingest
  // seenToCommit holds the source_ids we ingested this run; committed to the
  // "Seen Signal IDs" tab ONLY after the Signals rows are written (step 7), so
  // a mid-run failure re-ingests next time instead of silently dropping reviews.
  let rawSignals: RawSignal[];
  let seenToCommit: RawSignal[] = [];
  if (env.USE_MOCK) {
    rawSignals = await loadMockSignals();
    log(`Loaded ${rawSignals.length} mock signals`);
  } else {
    // Live sources fan out in parallel; each fails soft (returns []), so one
    // dead source never aborts the run. Amazon (Jina) lands in the next increment.
    const collected = (
      await Promise.all([
        loadAppStoreSignals({ limit: env.INGEST_MAX_PER_SOURCE }),
        loadPlayStoreSignals({ limit: env.INGEST_MAX_PER_SOURCE }),
      ])
    ).flat();
    log(`Live ingest collected ${collected.length} signal(s) across sources`);

    const seen = await loadSeenIds();
    rawSignals = filterUnseen(collected, seen);
    seenToCommit = rawSignals;
    log(`After dedup: ${rawSignals.length} new (${collected.length - rawSignals.length} already seen)`);

    if (rawSignals.length === 0) {
      throw new Error('Live ingestion produced 0 new signals (all already seen, or all sources empty).');
    }
  }

  // 2. Normalize → compute meta
  const { signals: normalizedSignals, meta } = normalize(rawSignals);
  log(`Normalized ${normalizedSignals.length} signals; weekId=${meta.weekId}`);

  // 3. Agent 1: clean (dedup + irrelevance + severity + version_flagged)
  const cleaned = await cleanSignals(normalizedSignals);
  log(`Cleaned: ${cleaned.length} signals survived`);

  // 4. Regression detection
  meta.regressions = detectRegressions(cleaned);
  log(`Regressions detected: ${meta.regressions.length}`);

  // 5. Fire regression alert (if any) IN PARALLEL with the rest
  const regressionEmailPromise =
    meta.regressions.length > 0
      ? (async () => {
          try {
            const { subject, html } = renderRegressionEmail({ meta });
            await sendEmail({ to: recipient, subject, html });
            log('Regression alert email sent');
          } catch (err) {
            console.error('[pipeline] Regression alert failed:', err);
          }
        })()
      : Promise.resolve();

  // 6. Agent 3: synthesize themes + tag with feature_group_id
  const tagged = await synthesize(cleaned);
  log(`Synthesized themes + feature-group tags`);

  // 7. Append signals to "Signals" sheet
  const sheetRows = formatSignalsForSheet(tagged, meta);
  await appendRows(env.SHEETS_SIGNALS_TAB, sheetRows);
  log(`Appended ${sheetRows.length} rows to "${env.SHEETS_SIGNALS_TAB}"`);

  // Signals are now persisted — safe to mark this run's source_ids as seen.
  if (seenToCommit.length > 0) {
    try {
      await commitSeenIds(seenToCommit);
      log(`Committed ${seenToCommit.length} source_id(s) to "${env.SHEETS_SEEN_SIGNALS_TAB}"`);
    } catch (err) {
      // Non-fatal: worst case we re-ingest these next run (dedup is best-effort).
      console.error('[pipeline] commitSeenIds failed (will re-ingest next run):', err);
    }
  }

  // 8. Read last week's digests for WoW deltas
  const lastWeekData = await readRows(env.SHEETS_DIGESTS_TAB);
  const lastWeekLookup = buildLastWeekLookup(lastWeekData);
  log(`Loaded ${lastWeekData.length} prior digest row(s) for WoW comparison`);

  // 9. Aggregate → RICE → MoSCoW → WoW deltas
  const { byGroup, themesPerGroup } = aggregateByGroup(tagged);
  const scoredGroupsBase = calculateRice(byGroup, themesPerGroup, meta);
  const scoredGroups = assignWoWDeltas(scoredGroupsBase, lastWeekLookup);
  log(`Scored ${scoredGroups.length} groups; top=${scoredGroups[0]?.feature_group_id} RICE=${scoredGroups[0]?.top_rice_score}`);

  // 10. Agent 5: discovery readiness on top group
  const topGroup = scoredGroups[0];
  if (!topGroup) throw new Error('No scored groups produced — pipeline aborted.');
  const themesOfTopGroup = themesPerGroup[topGroup.feature_group_id] || [];
  const { readiness, themesReady, themesBlocked } = await assessReadiness({
    topGroup,
    themesOfTopGroup,
  });
  log(`Readiness: ${readiness.overall_readiness} (READY=${themesReady}, BLOCKED=${themesBlocked})`);

  // 11. Append the weekly digest row
  const topGroupTopTheme = themesOfTopGroup[0]?.theme_label || topGroup.top_theme || '';
  const digestRow = formatDigestRow({
    weekId: meta.weekId,
    topGroup,
    topGroupTopTheme,
    scoredGroups,
    readiness,
    themesReady,
    themesBlocked,
    meta,
  });
  await appendRows(env.SHEETS_DIGESTS_TAB, [digestRow]);
  log(`Appended digest row to "${env.SHEETS_DIGESTS_TAB}"`);

  // 12. Build the per-group summary used by the digest email
  const groupSummaries: GroupSummary[] = scoredGroups.map((g, idx) => {
    const groupConfig = config.feature_groups.find((fg) => fg.id === g.feature_group_id);
    const themes = themesPerGroup[g.feature_group_id] || [];
    return {
      group_id: g.feature_group_id,
      group_name: groupConfig?.name || g.feature_group_id,
      rank: idx + 1,
      rice_score: g.top_rice_score,
      moscow: g.top_moscow,
      trend_direction: g.trend_direction,
      signal_count: g.signal_count,
      avg_severity: g.avg_severity,
      severity_delta: g.delta?.rice_delta ?? null,
      themes: themes.map((t) => ({
        theme_id: t.theme_id,
        theme_label: t.theme_label,
        trend_direction: t.trend_direction,
        signal_count: t.signals.length,
        top_signal: t.signals[0]?.text || '',
      })),
      top_signals: (byGroup[g.feature_group_id] || []).slice(0, 3).map((s) => s.text),
    };
  });

  const topGroupView: TopGroupView = {
    ...topGroup,
    group_id: topGroup.feature_group_id,
    group_name: config.feature_groups.find((fg) => fg.id === topGroup.feature_group_id)?.name,
    readiness: readiness.overall_readiness,
    readiness_summary: readiness.readiness_summary,
    theme_readiness: readiness.themes,
  };

  // 13. Send the digest email
  const baseUrl = env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`;
  const { subject, html } = renderDigestEmail({
    groupSummaries,
    topGroup: topGroupView,
    signalCount: tagged.length,
    weekId: meta.weekId,
    meta,
    readiness,
    baseUrl,
    recipientEmail: recipient,
  });
  await sendEmail({ to: recipient, subject, html });
  log('Digest email sent');

  // Wait for the regression email (if any) to finish before returning
  await regressionEmailPromise;

  const result: PipelineResult = {
    status: 'complete',
    weekId: meta.weekId,
    signalCount: tagged.length,
    topGroup: topGroup.feature_group_id,
    topRiceScore: topGroup.top_rice_score,
    topMoscow: topGroup.top_moscow,
    overallReadiness: readiness.overall_readiness,
    regressionCount: meta.regressions.length,
    completedAt: new Date().toISOString(),
  };
  log(`Pipeline complete: ${JSON.stringify(result)}`);
  return result;
}
