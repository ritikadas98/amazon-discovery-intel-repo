import type {
  Meta,
  MoSCoW,
  Readiness,
  ScoredGroup,
  ScoredTheme,
  TaggedSignal,
  Theme,
  TrendDirection,
} from '../types.js';

const SOURCE_CONFIDENCE: Record<number, number> = { 1: 0.6, 2: 0.8, 3: 1.0 };
const TREND_MULTIPLIER: Record<TrendDirection, number> = { worsening: 1.2, stable: 1.0, improving: 0.8 };

function getVersionRatioMultiplier(signals: TaggedSignal[]): number {
  const flagged = signals.filter((s) => s.version_flagged).length;
  const ratio = signals.length > 0 ? flagged / signals.length : 0;
  return 1 + ratio * 0.2;
}

function getEffort(groupId: string, meta: Meta): number {
  const isRegression = meta.regressions.some(
    (r) => Array.isArray(r.feature_groups_affected) && r.feature_groups_affected.includes(groupId),
  );
  return isRegression ? 0.8 : 1;
}

/**
 * Deterministic readiness — counts how many of the 4 evidence criteria are "strong".
 * Mirrors the rubric Agent 5 uses, so non-top groups (which don't get the AI assessment)
 * still have a defensible value. The AI-assessed result overrides this for top-group themes in run.ts.
 */
function computeThemeReadiness(theme: Theme): Readiness {
  const signals = theme.signals || [];
  if (signals.length === 0) return 'BLOCKED';
  const avgSeverity = signals.reduce((sum, s) => sum + (s.severity_score || 3.0), 0) / signals.length;
  const sources = new Set(signals.map((s) => s.source)).size;

  const strongCount = [
    signals.length >= 3,
    sources >= 3,
    avgSeverity >= 4.0,
    theme.trend_direction === 'worsening',
  ].filter(Boolean).length;

  if (strongCount >= 3) return 'READY';
  if (strongCount === 2) return 'NEEDS_MORE_EVIDENCE';
  return 'BLOCKED';
}

interface ThemeComponents {
  reach: number;
  impact: number;
  confidence: number;
  versionMultiplier: number;
  effort: number;
  trendMultiplier: number;
  systemRice: number;
}

function computeThemeComponents(theme: Theme, groupId: string, meta: Meta): ThemeComponents {
  const signals = theme.signals || [];
  if (signals.length === 0) {
    return { reach: 0, impact: 0, confidence: 0.6, versionMultiplier: 1, effort: 1, trendMultiplier: 1, systemRice: 0 };
  }
  const reach = signals.length;
  const impact = signals.reduce((sum, s) => sum + (s.severity_score || 3.0), 0) / signals.length;
  const sources = new Set(signals.map((s) => s.source)).size;
  const confidence = SOURCE_CONFIDENCE[Math.min(sources, 3)] || 0.6;
  const versionMultiplier = getVersionRatioMultiplier(signals);
  const trendMultiplier = TREND_MULTIPLIER[theme.trend_direction] || 1.0;
  const effort = getEffort(groupId, meta);
  const systemRice = ((reach * impact * confidence * versionMultiplier) / effort) * trendMultiplier;
  return { reach, impact, confidence, versionMultiplier, effort, trendMultiplier, systemRice };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * arr.length) - 1;
  return arr[Math.max(0, idx)];
}

/**
 * Mirrors "Calculate RICE Scores":
 *   RICE = (reach × severity × confidence × version_multiplier) / effort × trend_multiplier
 *   MoSCoW assigned by percentile cutoffs (p75/p50/p25) across all groups this run.
 *   Per-theme MoSCoW inherits the parent group's value after the cuts are applied.
 */
export function calculateRice(
  byGroup: Record<string, TaggedSignal[]>,
  themesPerGroup: Record<string, Theme[]>,
  meta: Meta,
): ScoredGroup[] {
  const scoredGroups: ScoredGroup[] = [];

  for (const [groupId, signals] of Object.entries(byGroup)) {
    if (!signals || signals.length === 0) continue;
    const themes = themesPerGroup[groupId] || [];

    const scoredThemes: ScoredTheme[] = themes.map((t) => {
      const c = computeThemeComponents(t, groupId, meta);
      const systemRice = Math.round(c.systemRice * 10) / 10;
      return {
        theme_id: t.theme_id,
        theme_label: t.theme_label,
        feature_group_id: groupId,
        trend_direction: t.trend_direction,
        signal_count: (t.signals || []).length,
        reach: c.reach,
        impact: Math.round(c.impact * 10) / 10,
        confidence: c.confidence,
        version_multiplier: Math.round(c.versionMultiplier * 100) / 100,
        effort: c.effort,
        trend_multiplier: c.trendMultiplier,
        system_rice: systemRice,
        // Placeholder — overwritten below once the group's MoSCoW is known.
        moscow: 'Could Have',
        readiness: computeThemeReadiness(t),
        theme_score: systemRice,
      };
    });

    const topTheme = scoredThemes.reduce(
      (best, t) => (t.system_rice > best.system_rice ? t : best),
      scoredThemes[0] || ({ system_rice: 0, theme_label: '' } as ScoredTheme),
    );
    const topRiceScore = topTheme?.system_rice ?? 0;

    const reach = signals.length;
    const avgSeverity =
      Math.round((signals.reduce((sum, s) => sum + (s.severity_score || 3.0), 0) / signals.length) * 10) / 10;
    const sources = new Set(signals.map((s) => s.source)).size;
    const confidence = SOURCE_CONFIDENCE[Math.min(sources, 3)] || 0.6;
    const versionMultiplier = getVersionRatioMultiplier(signals);

    const hasWorsening = themes.some((t) => t.trend_direction === 'worsening');
    const allImproving = themes.length > 0 && themes.every((t) => t.trend_direction === 'improving');
    const trendKey: TrendDirection = hasWorsening ? 'worsening' : allImproving ? 'improving' : 'stable';
    const trendMultiplier = TREND_MULTIPLIER[trendKey];
    const effort = getEffort(groupId, meta);

    scoredGroups.push({
      feature_group_id: groupId,
      top_rice_score: topRiceScore,
      avg_severity: avgSeverity,
      signal_count: reach,
      confidence,
      version_multiplier: Math.round(versionMultiplier * 100) / 100,
      effort,
      trend_direction: trendKey,
      trend_multiplier: trendMultiplier,
      top_theme: topTheme?.theme_label || '',
      scored_themes: scoredThemes,
      top_moscow: 'Could Have',
      delta: null,
    });
  }

  scoredGroups.sort((a, b) => b.top_rice_score - a.top_rice_score);

  const sortedScores = scoredGroups.map((g) => g.top_rice_score).sort((a, b) => a - b);
  const p75 = percentile(sortedScores, 75);
  const p50 = percentile(sortedScores, 50);
  const p25 = percentile(sortedScores, 25);

  const getMoSCoW = (score: number): MoSCoW => {
    if (score >= p75) return 'Must Have';
    if (score >= p50) return 'Should Have';
    if (score >= p25) return 'Could Have';
    return "Won't Have";
  };

  for (const g of scoredGroups) {
    g.top_moscow = getMoSCoW(g.top_rice_score);
    // Propagate the group's MoSCoW down to every theme inside it.
    for (const t of g.scored_themes) {
      t.moscow = g.top_moscow;
    }
  }

  return scoredGroups;
}
