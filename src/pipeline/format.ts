import {
  FORMULA_VERSION,
  type Meta,
  type Readiness,
  type ReadinessResult,
  type ScoredGroup,
  type ScoredTheme,
  type TaggedSignal,
  type ThemeBreakdownEntry,
  type ThemeDiagnosis,
  type ThemeReadiness,
} from '../types.js';

/** Mirrors "Format for Sheets" — column shaping for the "Signals" tab. */
export function formatSignalsForSheet(signals: TaggedSignal[], meta: Meta): Record<string, unknown>[] {
  const now = new Date().toISOString();
  return signals.map((s, i) => ({
    ID: `${meta.weekId}-${i}`,
    Text: s.text,
    Source: s.source,
    Date: s.date,
    Rating: s.rating,
    'Severity Score': s.severity_score,
    // What it cost the customer, which severity does not answer. See types.ts.
    Consequence: s.consequence,
    'Feature Group ID': s.feature_group_id,
    'Theme ID': s.theme_id,
    'Theme Label': s.theme_label,
    'Week ID': meta.weekId,
    'App Version': s.app_version || '',
    'Version Flagged': s.version_flagged ? 'TRUE' : 'FALSE',
    'Created At': now,
    'Data Source': meta.dataSource,
  }));
}

/** Build the row that goes into "Weekly Digests" — one row per run (top group snapshot). */
export interface DigestRowInput {
  weekId: string;
  topGroup: ScoredGroup;
  topGroupTopTheme: string;
  scoredGroups: ScoredGroup[];
  readiness: ReadinessResult | null;
  /** Headlines and mechanisms for READY themes. See diagnoseThemes. */
  diagnoses?: ThemeDiagnosis[];
  /** Every theme in the run, not just the top group's. See assessReadiness. */
  allThemeReadiness?: ThemeReadiness[];
  themesReady: number;
  themesBlocked: number;
  meta: Meta;
}

/** Flatten every group's themes into one array, overlaying the AI's readiness, gaps and next steps. */
function buildThemeBreakdown(
  scoredGroups: ScoredGroup[],
  allThemeReadiness: ThemeReadiness[],
  diagnoses: ThemeDiagnosis[] = [],
): ThemeBreakdownEntry[] {
  const aiByThemeId = new Map(allThemeReadiness.map((t) => [t.theme_id, t] as const));
  const dxByThemeId = new Map(diagnoses.map((d) => [d.theme_id, d] as const));
  const entries: ThemeBreakdownEntry[] = [];
  for (const g of scoredGroups) {
    for (const t of g.scored_themes) {
      const ai = aiByThemeId.get(t.theme_id);
      const readiness = ai?.readiness ?? t.readiness;
      entries.push({
        ...t,
        readiness,
        // Only READY themes are diagnosed, and a diagnosis can also fail
        // validation, so both fields are legitimately absent most of the time.
        // No fallback here on purpose: an invented headline is worse than none.
        headline: dxByThemeId.get(t.theme_id)?.headline,
        mechanism: nonEmpty(dxByThemeId.get(t.theme_id)?.mechanism),
        first_move: dxByThemeId.get(t.theme_id)?.firstMove,
        options: dxByThemeId.get(t.theme_id)?.options,
        options_leftover: dxByThemeId.get(t.theme_id)?.optionsLeftover,
        // Never persist an empty explanation. A readiness badge with nothing beside it
        // is the thing that made this panel unreadable; the model can still return
        // nothing, so the deterministic reason stands in when it does.
        gap_reasons: nonEmpty(ai?.gap_reasons) ?? fallbackGapReasons(t, readiness),
        recommended_next_steps: nonEmpty(ai?.recommended_next_steps) ?? fallbackNextSteps(readiness),
      });
    }
  }
  return entries;
}

function nonEmpty(list: string[] | undefined): string[] | undefined {
  const cleaned = (list ?? []).map((s) => s?.trim()).filter((s): s is string => !!s);
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Written from the numbers we already have, in the same plain register the prompt asks
 * the model for. Shared by the digest, the report and the email so the three cannot drift.
 */
function fallbackGapReasons(theme: ScoredTheme, readiness: Readiness): string[] {
  const reasons: string[] = [];
  if (theme.reach < 3) {
    reasons.push(
      theme.reach === 1 ? 'Only one person has raised this.' : `Only ${theme.reach} people have raised this.`,
    );
  }
  if (theme.confidence < 1.0) {
    reasons.push('It has come from one place, so it may not be widespread.');
  }
  if (theme.impact < 3.0) {
    reasons.push('The people who mentioned it were not especially unhappy.');
  }
  if (reasons.length === 0) {
    reasons.push(
      readiness === 'READY'
        ? 'Enough people, unhappy enough, from more than one place.'
        : 'The evidence is thin in more than one way.',
    );
  }
  return reasons;
}

function fallbackNextSteps(readiness: Readiness): string[] {
  if (readiness === 'READY') return ['Enough to act on. Take it to the team that owns this area.'];
  if (readiness === 'NEEDS_MORE_EVIDENCE') return ['Watch it for another week before committing anyone to it.'];
  return ['Not enough to act on yet. Leave it and see whether it grows.'];
}

export function formatDigestRow(input: DigestRowInput): Record<string, unknown> {
  const {
    weekId,
    topGroup,
    topGroupTopTheme,
    scoredGroups,
    readiness,
    allThemeReadiness,
    diagnoses,
    themesReady,
    themesBlocked,
    meta,
  } = input;

  return {
    'Week ID': weekId,
    'Feature Group ID': topGroup.feature_group_id,
    'Top Theme': topGroupTopTheme,
    'Signal Count': topGroup.signal_count,
    'Avg Severity': topGroup.avg_severity,
    'Trend Direction': topGroup.trend_direction,
    'Top RICE Score': topGroup.top_rice_score,
    'Top MoSCoW': topGroup.top_moscow,
    'RICE Scores JSON': JSON.stringify(
      scoredGroups.map((g) => ({ id: g.feature_group_id, score: g.top_rice_score })),
    ),
    'MoSCoW JSON': JSON.stringify(scoredGroups.map((g) => ({ id: g.feature_group_id, moscow: g.top_moscow }))),
    'Data Quality Warning': meta.dataQualityWarning ?? '',
    'WoW Delta JSON': JSON.stringify(
      scoredGroups.map((g) => ({
        id: g.feature_group_id,
        rice_delta: g.delta?.rice_delta ?? null,
        rice_delta_pct: g.delta?.rice_delta_pct ?? null,
        signal_delta: g.delta?.signal_delta ?? null,
        severity_delta: g.delta?.severity_delta ?? null,
        moscow_changed: g.delta?.moscow_changed ?? false,
        moscow_prev: g.delta?.moscow_prev ?? null,
        moscow_escalated: g.delta?.moscow_escalated ?? false,
      })),
    ),
    'Trend Direction JSON': JSON.stringify(
      scoredGroups.map((g) => ({ id: g.feature_group_id, trend: g.trend_direction })),
    ),
    'Theme Breakdown JSON': JSON.stringify(buildThemeBreakdown(scoredGroups, allThemeReadiness ?? readiness?.themes ?? [], diagnoses)),
    // Stamps which scoring formula produced the numbers in this row, so a later
    // run can refuse to publish a week-over-week delta across a formula change.
    'Formula Version': FORMULA_VERSION,
    'Created At': new Date().toISOString(),
    'Discovery Readiness JSON': JSON.stringify(readiness ?? {}),
    'Overall Group Readiness': readiness?.overall_readiness ?? '',
    'Themes Ready Count': themesReady,
    'Themes Blocked Count': themesBlocked,
    'Data Source': meta.dataSource,
    'Dropped Duplicate': meta.cleaning?.droppedDuplicate ?? 0,
    'Dropped Irrelevant': meta.cleaning?.droppedIrrelevant ?? 0,
  };
}
