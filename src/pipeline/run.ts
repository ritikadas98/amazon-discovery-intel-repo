import { getEnv } from '../config/env.js';
import { config } from '../config/featureGroups.js';
import { loadMockSignals } from '../sources/mockSignals.js';
import { loadAppStoreSignals } from '../sources/appStore.js';
import { loadPlayStoreSignals } from '../sources/playStore.js';
import { loadAmazonSignals } from '../sources/amazon.js';
import { commitSeenIds, filterUnseen, loadSeenIds } from '../sources/dedupe.js';
import { normalize } from './normalize.js';
import { cleanSignals } from '../agents/clean.js';
import { detectRegressions } from './regression.js';
import { synthesize } from '../agents/synthesize.js';
import { aggregateByGroup } from './aggregate.js';
import { calculateRice } from './rice.js';
import { assignWoWDeltas, buildLastWeekLookup } from './wow.js';
import { assessReadiness } from '../agents/readiness.js';
import { diagnoseThemes, type ThemeToDiagnose } from '../agents/diagnose.js';
import { formatDigestRow, formatSignalsForSheet } from './format.js';
import { appendRows, readRows } from '../lib/sheets.js';
import { sendEmail } from '../lib/email.js';
import { renderRegressionEmail } from '../templates/regressionEmail.js';
import { renderDigestEmail } from '../templates/digestEmail.js';
import type {
  ThemeDiagnosis,
  GroupSummary,
  PipelineResult,
  RawSignal,
  Readiness,
  ReadinessResult,
  RunOptions,
  ThemeReadiness,
  TopGroupView,
} from '../types.js';

/** Worst readiness across a group's themes — the honest group-level summary when the
 *  LLM assessment is unavailable. BLOCKED beats NEEDS_MORE_EVIDENCE beats READY. */
function worstReadiness(themes: Array<{ readiness: Readiness }>): Readiness {
  if (themes.some((t) => t.readiness === 'BLOCKED')) return 'BLOCKED';
  if (themes.some((t) => t.readiness === 'NEEDS_MORE_EVIDENCE')) return 'NEEDS_MORE_EVIDENCE';
  return 'READY';
}

export async function runPipeline(opts: RunOptions): Promise<PipelineResult> {
  const env = getEnv();
  const recipient = opts.recipient_email;
  // Per-run override (from the UI Sample/Live toggle) wins over the env default.
  const useMock = opts.use_mock ?? env.USE_MOCK;
  const log = (msg: string) => console.log(`[pipeline] ${msg}`);

  log(`Starting run — recipient=${recipient}, mock=${useMock}`);

  // 1. Ingest
  // seenToCommit holds the source_ids we ingested this run; committed to the
  // "Seen Signal IDs" tab ONLY after the Signals rows are written (step 7), so
  // a mid-run failure re-ingests next time instead of silently dropping reviews.
  let rawSignals: RawSignal[];
  let seenToCommit: RawSignal[] = [];
  if (useMock) {
    rawSignals = await loadMockSignals();
    log(`Loaded ${rawSignals.length} mock signals`);
  } else {
    // Live sources fan out in parallel; each fails soft (returns []), so one
    // dead source never aborts the run. Play Store is the reliable app-review
    // source and is always on; App Store (0 from Cloud Run — Apple IP block)
    // and Amazon PLP (product-opinion, not platform signal) are opt-in flags.
    const sources: Array<Promise<RawSignal[]>> = [
      loadPlayStoreSignals({ limit: env.INGEST_MAX_PER_SOURCE }),
    ];
    if (env.ENABLE_APP_STORE) sources.push(loadAppStoreSignals({ limit: env.INGEST_MAX_PER_SOURCE }));
    if (env.ENABLE_AMAZON_PLP) sources.push(loadAmazonSignals({ limit: env.INGEST_MAX_PER_SOURCE }));

    const collected = (await Promise.all(sources)).flat();
    log(
      `Live ingest collected ${collected.length} signal(s) across ${sources.length} source(s) ` +
        `(appStore=${env.ENABLE_APP_STORE}, amazonPLP=${env.ENABLE_AMAZON_PLP})`,
    );

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
  meta.dataSource = useMock ? 'Sample' : 'Live';
  log(`Normalized ${normalizedSignals.length} signals; weekId=${meta.weekId}; source=${meta.dataSource}`);

  // 3. Agent 1: clean (dedup + irrelevance + severity + version_flagged)
  const { signals: cleaned, droppedDuplicate, droppedIrrelevant } = await cleanSignals(normalizedSignals);
  meta.cleaning = { droppedDuplicate, droppedIrrelevant };
  log(`Cleaned: ${cleaned.length} survived (${droppedDuplicate} dup, ${droppedIrrelevant} irrelevant)`);

  // 4. Regression detection
  meta.regressions = detectRegressions(cleaned);
  log(`Regressions detected: ${meta.regressions.length}`);

  // 5. Fire regression alert (if any) IN PARALLEL with the rest
  //
  // Always to the owner, never to whoever triggered the run. Anyone may now ask for
  // the digest at their own address. This alert is not that: it is an operational
  // warning that one app version is producing a cluster of complaints, and it fires
  // before the digest is ready. A stranger who asked for one email would receive two,
  // and the second would be an internal alert about a product they do not work on.
  const regressionRecipient = env.DEFAULT_RECIPIENT || recipient;
  const regressionEmailPromise =
    meta.regressions.length > 0
      ? (async () => {
          try {
            const { subject, html } = renderRegressionEmail({ meta });
            await sendEmail({ to: regressionRecipient, subject, html });
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
  const allPriorDigests = await readRows(env.SHEETS_DIGESTS_TAB);
  // WoW must not cross data sources — a Live run compares only to prior Live
  // digests, Sample only to Sample (else a thin live run gets skewed deltas vs
  // the rich fixture). Untagged/legacy rows read as Live.
  const lastWeekData = allPriorDigests.filter(
    (r) => (r['Data Source'] || 'Live').toLowerCase() === meta.dataSource.toLowerCase(),
  );
  const lastWeekLookup = buildLastWeekLookup(lastWeekData);
  log(`Loaded ${lastWeekData.length} prior ${meta.dataSource} digest row(s) for WoW comparison`);

  // 9. Aggregate → RICE → MoSCoW → WoW deltas
  const { byGroup, themesPerGroup } = aggregateByGroup(tagged);
  const scoredGroupsBase = calculateRice(byGroup, themesPerGroup, meta);
  const scoredGroups = assignWoWDeltas(scoredGroupsBase, lastWeekLookup);
  log(`Scored ${scoredGroups.length} groups; top=${scoredGroups[0]?.feature_group_id} RICE=${scoredGroups[0]?.top_rice_score}`);

  // 10. Agent 5: discovery readiness across every group, in one call
  const topGroup = scoredGroups[0];
  if (!topGroup) throw new Error('No scored groups produced — pipeline aborted.');
  const themesOfTopGroup = themesPerGroup[topGroup.feature_group_id] || [];

  // Readiness enriches the run; it does not constitute it. Every theme already carries
  // a deterministic readiness from the same four criteria, and format.ts writes plain
  // gap reasons and next steps when the model gives none — so if this stage fails the
  // digest is slightly less nuanced, not absent.
  //
  // It used to throw and take the whole pipeline with it: a week of ingestion, cleaning
  // and scoring discarded because one LLM response came back unparseable. Losing all of
  // that for the least critical stage is the wrong trade.
  let readiness: ReadinessResult | null = null;
  let themesReady = 0;
  let themesBlocked = 0;
  let allThemeReadiness: ThemeReadiness[] = [];
  try {
    const assessed = await assessReadiness({ scoredGroups, themesPerGroup });
    ({ readiness, themesReady, themesBlocked, allThemeReadiness } = assessed);
    log(
      `Readiness: ${readiness.overall_readiness} (READY=${themesReady}, BLOCKED=${themesBlocked})` +
        ` across ${allThemeReadiness.length} themes in ${scoredGroups.length} groups`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Readiness stage FAILED, continuing with deterministic values only: ${message}`);
  }

  // 10b. Diagnose the themes worth words, and always at least one.
  //
  // This was READY-only. On live data that meant never: the readiness rubric
  // needs 3 of 4 criteria strong, one of which is signals from 3+ sources, and
  // Cloud Run is IP-blocked from the App Store — so live runs are effectively
  // Play-Store-only and every theme comes back BLOCKED. A gate no real run can
  // pass is not a gate, and the digest's headline card was permanently empty.
  //
  // So: diagnose everything READY, and if nothing is, diagnose the single
  // highest-scoring theme anyway. The UI marks that one provisional, and the
  // "what we still don't know" panel is already loud about thin evidence. A
  // hedged reading beats no reading; a confident one would not.
  //
  // Cost is unchanged in shape — one to three themes — and cannot run away,
  // because the fallback is exactly one.
  let diagnoses: ThemeDiagnosis[] = [];
  const readinessById = new Map(allThemeReadiness.map((t) => [t.theme_id, t.readiness] as const));

  const candidates: ThemeToDiagnose[] = [];
  for (const g of scoredGroups) {
    const groupName =
      config.feature_groups.find((c) => c.id === g.feature_group_id)?.name ?? g.feature_group_id;
    for (const scored of g.scored_themes) {
      const theme = (themesPerGroup[g.feature_group_id] || []).find(
        (t) => t.theme_id === scored.theme_id,
      );
      if (!theme) continue;
      const readiness = readinessById.get(scored.theme_id) ?? scored.readiness;
      candidates.push({ theme, scored, groupName, readiness });
    }
  }

  // One diagnosis per group, not one per run.
  //
  // Diagnosing only the single top theme left six of seven group pages without a
  // "what we think is going on" panel — the page visibly thinner than the one the
  // design was built around. A diagnosis call sends 12 reviews and costs about
  // fifteen paise, so covering every group adds roughly a rupee to a run that
  // already costs three to five.
  //
  // READY themes are still preferred where a group has them; where none does, the
  // group's top-scoring theme is diagnosed and rendered as provisional.
  const candidatesByGroup = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const key = c.scored.feature_group_id;
    const list = candidatesByGroup.get(key);
    if (list) list.push(c);
    else candidatesByGroup.set(key, [c]);
  }
  const ready = candidates.filter((c) => c.readiness === 'READY');
  const toDiagnose = [...candidatesByGroup.values()].flatMap((group) => {
    const readyHere = group.filter((c) => c.readiness === 'READY');
    if (readyHere.length > 0) return readyHere;
    return [...group].sort((a, b) => b.scored.system_rice - a.scored.system_rice).slice(0, 1);
  });

  if (toDiagnose.length > 0) {
    try {
      diagnoses = await diagnoseThemes(toDiagnose);
      const basis = ready.length > 0 ? 'READY' : 'top-scoring (provisional — nothing was READY)';
      log(`Diagnosed ${diagnoses.length} of ${toDiagnose.length} ${basis} theme(s)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Diagnosis stage FAILED, continuing without headlines: ${message}`);
    }
  } else {
    log('No themes to diagnose this run — skipping (no API call made)');
  }

  // 11. Append the weekly digest row
  const topGroupTopTheme = themesOfTopGroup[0]?.theme_label || topGroup.top_theme || '';
  const digestRow = formatDigestRow({
    weekId: meta.weekId,
    topGroup,
    topGroupTopTheme,
    scoredGroups,
    readiness,
    allThemeReadiness,
    diagnoses,
    themesReady,
    themesBlocked,
    meta,
  });
  // The row is appended further down, once the digest email has been rendered, so
  // the finished email can be stored alongside the analysis that produced it. See
  // the note at the append site.

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
      // The email leads with the finding when there is one. Keyed to this
      // group's highest-scoring theme, which is the one the card is about.
      ...(() => {
        const top = [...g.scored_themes].sort((a, b) => b.system_rice - a.system_rice)[0];
        const dx = top ? diagnoses.find((d) => d.theme_id === top.theme_id) : undefined;
        return {
          headline: dx?.headline,
          consequence: top?.consequence,
          consequence_count: top?.consequence_count,
          first_move: dx?.firstMove,
        };
      })(),
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
    // Falls back to the top group's worst deterministic theme readiness when the LLM
    // stage was skipped, so the digest still states a position rather than nothing.
    readiness: readiness?.overall_readiness ?? worstReadiness(topGroup.scored_themes),
    readiness_summary: readiness?.readiness_summary ?? '',
    theme_readiness: readiness?.themes ?? [],
  };

  // 13. Send the digest email
  const baseUrl = env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`;
  // Falls back to the live site rather than to the API host: a wrong-but-useful
  // link beats one that lands a PM on a JSON endpoint.
  const appUrl = env.APP_BASE_URL ?? 'https://amazon.ritikadas.in';
  const { subject, html } = renderDigestEmail({
    groupSummaries,
    topGroup: topGroupView,
    signalCount: tagged.length,
    weekId: meta.weekId,
    meta,
    readiness,
    baseUrl,
    appUrl,
    recipientEmail: recipient,
  });
  // Keep the finished email with the run that produced it.
  //
  // Requests inside 24 hours reuse this analysis rather than re-running. Sending
  // the digest again then means either rebuilding the email from the stored row —
  // reconstructing sixteen fields, three of which were never saved, with every one
  // a chance to differ silently from the original — or simply keeping the email we
  // already rendered. It is about 11k characters against a 50k cell limit, so it
  // keeps. Storing the bytes removes the whole class of drift: the reused digest is
  // not a rebuilt copy, it is the same email.
  //
  // Guarded on size. An unusually large week is not worth failing the append over,
  // and the reuse path falls back to a short pointer email when this is absent.
  // A Sheets cell holds 50,000 characters. This was set to 45,000 when the only
  // email available to measure was a 10,770-character test render. The first live
  // one came in at 40,179, so the real margin was 4,800 rather than the 34,000 I
  // assumed. Raised to sit just under the cell limit instead of well under it.
  const MAX_STORED_EMAIL_CHARS = 49000;
  if (html.length <= MAX_STORED_EMAIL_CHARS) {
    digestRow['Digest Email Subject'] = subject;
    digestRow['Digest Email HTML'] = html;
  } else {
    log(`Digest email too large to store (${html.length} chars); reuse will send a pointer`);
  }
  await appendRows(env.SHEETS_DIGESTS_TAB, [digestRow]);
  log(`Appended digest row to "${env.SHEETS_DIGESTS_TAB}"`);

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
    overallReadiness: readiness?.overall_readiness ?? worstReadiness(topGroup.scored_themes),
    regressionCount: meta.regressions.length,
    droppedDuplicate,
    droppedIrrelevant,
    completedAt: new Date().toISOString(),
  };
  log(`Pipeline complete: ${JSON.stringify(result)}`);
  return result;
}
