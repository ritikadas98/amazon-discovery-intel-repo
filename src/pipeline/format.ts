import type {
  Meta,
  ReadinessResult,
  ScoredGroup,
  TaggedSignal,
  ThemeBreakdownEntry,
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
    'Feature Group ID': s.feature_group_id,
    'Theme ID': s.theme_id,
    'Theme Label': s.theme_label,
    'Week ID': meta.weekId,
    'App Version': s.app_version || '',
    'Version Flagged': s.version_flagged ? 'TRUE' : 'FALSE',
    'Created At': now,
  }));
}

/** Build the row that goes into "Weekly Digests" — one row per run (top group snapshot). */
export interface DigestRowInput {
  weekId: string;
  topGroup: ScoredGroup;
  topGroupTopTheme: string;
  scoredGroups: ScoredGroup[];
  readiness: ReadinessResult | null;
  themesReady: number;
  themesBlocked: number;
  meta: Meta;
}

/** Flatten every group's themes into one array, overlaying AI-assessed readiness + gaps for the top group. */
function buildThemeBreakdown(
  scoredGroups: ScoredGroup[],
  readiness: ReadinessResult | null,
): ThemeBreakdownEntry[] {
  const aiByThemeId = new Map(
    (readiness?.themes ?? []).map((t) => [t.theme_id, t] as const),
  );
  const entries: ThemeBreakdownEntry[] = [];
  for (const g of scoredGroups) {
    for (const t of g.scored_themes) {
      const ai = aiByThemeId.get(t.theme_id);
      entries.push({
        ...t,
        // AI-assessed readiness wins for top-group themes; deterministic value stands elsewhere.
        readiness: ai?.readiness ?? t.readiness,
        gap_reasons: ai?.gap_reasons,
        recommended_next_steps: ai?.recommended_next_steps,
      });
    }
  }
  return entries;
}

export function formatDigestRow(input: DigestRowInput): Record<string, unknown> {
  const { weekId, topGroup, topGroupTopTheme, scoredGroups, readiness, themesReady, themesBlocked, meta } = input;

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
    'Theme Breakdown JSON': JSON.stringify(buildThemeBreakdown(scoredGroups, readiness)),
    'Created At': new Date().toISOString(),
    'Discovery Readiness JSON': JSON.stringify(readiness ?? {}),
    'Overall Group Readiness': readiness?.overall_readiness ?? '',
    'Themes Ready Count': themesReady,
    'Themes Blocked Count': themesBlocked,
  };
}
