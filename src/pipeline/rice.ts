import {
  CONSEQUENCE_ORDER,
  type Consequence,
  type Meta,
  type MoSCoW,
  type Readiness,
  type ScoredGroup,
  type ScoredTheme,
  type TaggedSignal,
  type Source,
  type Theme,
  type ThemeEvidence,
  type TrendDirection,
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
  const sources = new Set(signals.map((s) => s.source)).size;
  const confidence = SOURCE_CONFIDENCE[Math.min(sources, 3)] || 0.6;
  const trendMultiplier = TREND_MULTIPLIER[theme.trend_direction] || 1.0;
  const effort = getEffort(groupId, meta);

  // Round the components BEFORE scoring, not after.
  //
  // These are the numbers the UI publishes next to the score, and it used to round
  // them for storage while computing the score from the full-precision values. A
  // reader multiplying what they saw landed ~0.2 away from what they were shown —
  // small, but it makes a page that claims every figure is checkable into one that
  // isn't. Scoring from the rounded values means the published identity holds exactly.
  const impact = round1(signals.reduce((sum, s) => sum + (s.severity_score || 3.0), 0) / signals.length);
  const versionMultiplier = round2(getVersionRatioMultiplier(signals));

  // FORMULA_VERSION 2 — effort and trend are computed and stored, but no longer
  // multiplied in. Neither was carrying its weight:
  //
  //   effort  takes exactly two values (0.8 for a regression group, else 1) and
  //           is a property of the GROUP, so it scales every theme inside that
  //           group by the same amount and cannot reorder them. It is a
  //           regression discount wearing the name of an effort estimate. The
  //           PM supplies real effort in the UI, where it is theirs to set.
  //   trend   is derived from week-over-week movement, and two pipeline runs
  //           can land in the same week (they append, never upsert), so the
  //           comparison behind it is not sound. Across 2026-W33 it was 1.2 on
  //           every scored theme, which is a constant by another name.
  //
  // Dropping both left the ranking of all 12 themes in that week identical —
  // asserted in rice.test.ts.
  const systemRice = round1(reach * impact * confidence * versionMultiplier);
  return { reach, impact, confidence, versionMultiplier, effort, trendMultiplier, systemRice };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Longest quotation kept. Long enough to carry a point, short enough to scan. */
const MAX_QUOTE_CHARS = 240;

/** Words carried by almost every review, so overlap in them means nothing. */
const STOP = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'not', 'was', 'have', 'has',
  'but', 'are', 'they', 'its', 'from', 'get', 'got', 'app', 'amazon', 'been', 'when',
  'what', 'your', 'all', 'can', 'will', 'would', 'there', 'their', 'them', 'out',
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

/** Jaccard overlap. 1 means the same words, 0 means nothing shared. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= MAX_QUOTE_CHARS ? clean : `${clean.slice(0, MAX_QUOTE_CHARS - 1)}…`;
}

/**
 * Count what the signals actually say. No model involved — see ThemeEvidence.
 */
function computeEvidence(theme: Theme): ThemeEvidence {
  const signals = theme.signals || [];
  if (signals.length === 0) {
    return { sources: [], topVersion: null, consequences: [], quotes: [], dateRange: null };
  }

  const bySource = new Map<Source, number>();
  const byVersion = new Map<string, number>();
  const byConsequence = new Map<Consequence, number>();
  for (const s of signals) {
    bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
    byConsequence.set(s.consequence, (byConsequence.get(s.consequence) ?? 0) + 1);
    const v = (s.app_version || '').trim();
    if (v) byVersion.set(v, (byVersion.get(v) ?? 0) + 1);
  }

  // A version is only worth printing if it looks like concentration. One
  // mention out of fourteen is a coincidence, and putting it on the card as
  // "1 of 14 on 5.2" invites a reader to chase a build for no reason.
  const versions = [...byVersion.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count >= 2 && count / signals.length >= 0.25);
  const dates = signals.map((s) => s.date).filter(Boolean).sort();

  // Most severe first, then the quote least like it. Picking the top two by
  // severity alone routinely returns two phrasings of the same complaint, which
  // reads as corroboration where there is only repetition.
  const ranked = [...signals].sort((a, b) => (b.severity_score || 0) - (a.severity_score || 0));
  const quotes = ranked.slice(0, 1);
  if (ranked.length > 1) {
    const firstWords = contentWords(ranked[0].text);
    let mostDistinct = ranked[1];
    let lowest = Infinity;
    for (const s of ranked.slice(1)) {
      const score = overlap(firstWords, contentWords(s.text));
      if (score < lowest) {
        lowest = score;
        mostDistinct = s;
      }
    }
    quotes.push(mostDistinct);
  }

  return {
    sources: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    topVersion: versions.length > 0 ? { version: versions[0][0], count: versions[0][1] } : null,
    consequences: CONSEQUENCE_ORDER.filter((c) => byConsequence.has(c)).map((c) => ({
      consequence: c,
      count: byConsequence.get(c)!,
    })),
    quotes: quotes.map((s) => ({
      text: truncate(s.text),
      source: s.source,
      severity: s.severity_score,
    })),
    dateRange: dates.length > 0 ? { first: dates[0], last: dates[dates.length - 1] } : null,
  };
}

/**
 * A theme takes the most costly consequence present in it, and the count of
 * signals at that tier. Worst-case rather than average: one double charge
 * inside ten grumbles is still a double charge, and averaging would bury it.
 */
function rollUpConsequence(theme: Theme): { consequence: Consequence; count: number } {
  const signals = theme.signals || [];
  for (const tier of CONSEQUENCE_ORDER) {
    const count = signals.filter((s) => s.consequence === tier).length;
    if (count > 0) return { consequence: tier, count };
  }
  return { consequence: 'annoyance', count: 0 };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * arr.length) - 1;
  return arr[Math.max(0, idx)];
}

interface MoSCoWCuts {
  p75: number;
  p50: number;
  p25: number;
}

/**
 * MoSCoW is a forced ranking, not an absolute judgement: the cuts are drawn from
 * whatever is in this run, so something is always "Must Have" even in a quiet week.
 * That is a deliberate trade — it keeps the list decision-shaped — and the UI says
 * so in its "How this is scored" panel rather than letting a reader assume otherwise.
 */
function percentileCuts(scores: number[]): MoSCoWCuts {
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    p75: percentile(sorted, 75),
    p50: percentile(sorted, 50),
    p25: percentile(sorted, 25),
  };
}

function moscowFor(score: number, cuts: MoSCoWCuts): MoSCoW {
  if (score >= cuts.p75) return 'Must Have';
  if (score >= cuts.p50) return 'Should Have';
  if (score >= cuts.p25) return 'Could Have';
  return "Won't Have";
}

/**
 * Mirrors "Calculate RICE Scores":
 *   RICE = (reach × severity × confidence × version_multiplier) / effort × trend_multiplier
 *   MoSCoW assigned by percentile cutoffs (p75/p50/p25), drawn separately for
 *   groups (across group scores) and themes (across theme scores).
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
      // Already rounded inside computeThemeComponents, so the stored components and
      // the stored score are the same numbers the UI prints. Do not re-round here.
      const c = computeThemeComponents(t, groupId, meta);
      const systemRice = c.systemRice;
      const cons = rollUpConsequence(t);
      return {
        theme_id: t.theme_id,
        theme_label: t.theme_label,
        feature_group_id: groupId,
        trend_direction: t.trend_direction,
        signal_count: (t.signals || []).length,
        reach: c.reach,
        impact: c.impact,
        confidence: c.confidence,
        version_multiplier: c.versionMultiplier,
        effort: c.effort,
        trend_multiplier: c.trendMultiplier,
        system_rice: systemRice,
        consequence: cons.consequence,
        consequence_count: cons.count,
        evidence: computeEvidence(t),
        // Placeholder — overwritten below once every theme's score is known.
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

  // Two separate percentile ladders, because a group's priority and a theme's
  // priority are different claims.
  //
  // Themes used to inherit their group's MoSCoW wholesale. That put "Must Have"
  // on a theme scoring 2.4 sitting next to one scoring 85.6 — a 35x gap wearing
  // the same label — so at theme level the badge carried no information at all.
  // Themes are now cut against the spread of themes.
  const groupCuts = percentileCuts(scoredGroups.map((g) => g.top_rice_score));
  for (const g of scoredGroups) {
    g.top_moscow = moscowFor(g.top_rice_score, groupCuts);
  }

  const allThemes = scoredGroups.flatMap((g) => g.scored_themes);
  const themeCuts = percentileCuts(allThemes.map((t) => t.system_rice));
  for (const t of allThemes) {
    t.moscow = moscowFor(t.system_rice, themeCuts);
  }

  return scoredGroups;
}
