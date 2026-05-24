import type { Meta, MoSCoW, ScoredGroup, ScoredTheme, TaggedSignal, Theme, TrendDirection } from '../types.js';

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

function scoreTheme(theme: Theme, groupId: string, meta: Meta): number {
  const signals = theme.signals || [];
  if (signals.length === 0) return 0;
  const reach = signals.length;
  const avgSeverity = signals.reduce((sum, s) => sum + (s.severity_score || 3.0), 0) / signals.length;
  const sources = new Set(signals.map((s) => s.source)).size;
  const confidence = SOURCE_CONFIDENCE[Math.min(sources, 3)] || 0.6;
  const versionMultiplier = getVersionRatioMultiplier(signals);
  const trendMultiplier = TREND_MULTIPLIER[theme.trend_direction] || 1.0;
  const effort = getEffort(groupId, meta);
  return ((reach * avgSeverity * confidence * versionMultiplier) / effort) * trendMultiplier;
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

    const scoredThemes: ScoredTheme[] = themes.map((t) => ({
      theme_id: t.theme_id,
      theme_label: t.theme_label,
      trend_direction: t.trend_direction,
      signal_count: (t.signals || []).length,
      theme_score: Math.round(scoreTheme(t, groupId, meta) * 10) / 10,
    }));

    const topTheme = scoredThemes.reduce(
      (best, t) => (t.theme_score > best.theme_score ? t : best),
      scoredThemes[0] || { theme_score: 0, theme_label: '' } as ScoredTheme,
    );
    const topRiceScore = topTheme.theme_score || 0;

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
      top_theme: topTheme.theme_label || '',
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
  }

  return scoredGroups;
}
