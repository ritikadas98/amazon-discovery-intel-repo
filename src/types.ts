export type Source = 'app_store' | 'play_store' | 'amazon_review' | 'unknown';

export type TrendDirection = 'worsening' | 'stable' | 'improving';
export type MoSCoW = 'Must Have' | 'Should Have' | 'Could Have' | "Won't Have";
export type Readiness = 'READY' | 'NEEDS_MORE_EVIDENCE' | 'BLOCKED';
export type CriteriaLevel = 'strong' | 'moderate' | 'weak';

/**
 * What the problem cost the customer — the question severity does not answer.
 *
 * severity_score rates how the review *sounds*. Across week 2026-W33 the
 * signals that mention money averaged 3.94 and pure anger averaged 3.50, so
 * the two are correlated but weakly; inside a single theme they invert. In
 * checkout_payment that week, the one signal where money actually moved
 * wrongly scored 4.0, below two blocked checkouts at 4.5. Ranking by severity
 * alone therefore puts the cheaper problem first.
 *
 * Ordered most to least costly. A theme takes the highest tier present.
 */
export type Consequence = 'money' | 'lost' | 'blocked' | 'annoyance';

export const CONSEQUENCE_ORDER: readonly Consequence[] = ['money', 'lost', 'blocked', 'annoyance'];

/**
 * Bumped whenever the meaning of `system_rice` changes, so week-over-week
 * deltas can refuse to compare two different formulas. See `wow.ts`.
 *
 * v1: (reach × impact × confidence × version) / effort × trend
 * v2: reach × impact × confidence × version — effort and trend removed from
 *     the product. Both are still computed and stored; neither reordered
 *     anything. See DECISIONS.md.
 */
export const FORMULA_VERSION = 2;

/**
 * The countable half of a theme's evidence.
 *
 * Everything here is arithmetic over the theme's own signals — no model, no
 * cost, and nothing that can be hallucinated or injected. It answers "what did
 * people actually report", which is the column a PM checks before believing
 * anything the model inferred on top of it.
 *
 * Computed in the pipeline rather than the browser on purpose: `theme.signals`
 * is the exact set this run scored, while a frontend join on Theme ID can pick
 * up signals from a different run that shares the week.
 */
export interface ThemeEvidence {
  /** Signal count per source, biggest first. */
  sources: Array<{ source: Source; count: number }>;
  /** The most-named app version and how many signals named it, if any did. */
  topVersion: { version: string; count: number } | null;
  /** Consequence tally, most costly tier first. */
  consequences: Array<{ consequence: Consequence; count: number }>;
  /**
   * Two verbatim quotations: the most severe, then the one least like it.
   * Two similar quotes are one piece of evidence printed twice.
   */
  quotes: Array<{ text: string; source: Source; severity: number }>;
  /** Earliest and latest signal date in the theme. */
  dateRange: { first: string; last: string } | null;
}

/**
 * The inferred half, written by Agent 6 for READY themes only.
 *
 * Kept as its own type, and rendered in its own panel, because a reader must be
 * able to tell it apart from `ThemeEvidence` at a glance. One is counted; this
 * one is an argument, and arguments can be wrong.
 */
export interface ThemeDiagnosis {
  theme_id: string;
  /** The finding in one sentence — what happened to customers, not a category. */
  headline: string;
  /** 2–3 bullets on what we think is going on underneath. */
  mechanism: string[];
  /** The one cheap step that comes before committing anyone. Absent if rejected. */
  firstMove?: FirstMove;
  /** What the first move gates: the moves worth choosing between once it reports. */
  options?: MoveOption[];
  /** Complaints no listed option addresses. Named, because a menu that hides its own gaps is worse than no menu. */
  optionsLeftover?: string;
}

/**
 * What kind of move this is, in increasing order of commitment.
 *
 * The distinction is the point. Reviews can establish that something is wrong;
 * they cannot establish how often, and almost every theme's honest first step
 * is to find that out. A digest that opens with "rebuild checkout" from five
 * reviews is worse than one that opens with a query, because it spends
 * engineering time to learn what a dashboard already knows.
 */
export type MoveKind = 'query' | 'check' | 'ship';

/**
 * One of the moves available once the first move has reported back.
 *
 * `covers` is the honest part: how many of this problem's complaints the option
 * actually addresses. Three options listed without it read as three equally
 * good ideas, which is how a backlog fills with work that fixes the smallest
 * slice. A move that fixes nothing on its own — splitting a theme so two teams
 * can own their half — is allowed to say `covers: 0`.
 */
export interface MoveOption {
  title: string;
  /** How many of the theme's complaints this addresses. 0 is a valid answer. */
  covers: number;
  /** Rough size, in plain words: "Medium build", "Routing · 1 day". */
  effort: string;
  /** What it buys, and what it does not. */
  tradeoff: string;
}

export interface FirstMove {
  kind: MoveKind;
  /** The step itself, named specifically. A metric, a source, a team. */
  action: string;
  /** Who does it — a function, not a person. */
  owner: string;
  /** Rough duration, in plain words. */
  effort: string;
  /** Why this before anything else, and what it would settle. */
  rationale: string;
}

export interface RawSignal {
  text: string;
  source: Source;
  date: string;
  rating: number | null;
  severity_raw: number | null;
  app_version: string | null;
  /**
   * Stable per-review identity for cross-run dedup (live ingestion only).
   * Prefer a native ID (App Store entry id, Play reviewId); fall back to a
   * content hash. Prefixed by source, e.g. "app_store:14127690220".
   * Mock signals leave this undefined. Dropped by normalize() — used only at
   * the ingestion/dedup stage, before normalization.
   */
  source_id?: string;
}

export interface SourceBreakdown {
  app_store: number;
  play_store: number;
  amazon_review: number;
  unknown: number;
  total: number;
}

export interface Regression {
  version: string;
  signal_count: number;
  top_signals: string[];
  feature_groups_affected: string[];
}

export interface Meta {
  weekId: string;
  sourceBreakdown: SourceBreakdown;
  dataQualityWarning: string | null;
  regressions: Regression[];
  /** Provenance of this run's data, persisted to the sheet so the UI can
   *  separate the curated fixture from real ingestion. Set in run.ts. */
  dataSource: 'Sample' | 'Live';
  /** Counts of signals Agent 1 dropped (dedup + irrelevance). Set in run.ts
   *  after the clean stage; surfaced in the digest row + run toast so silent
   *  drops become auditable (A7). */
  cleaning?: {
    droppedDuplicate: number;
    droppedIrrelevant: number;
  };
}

export interface FeatureGroup {
  id: string;
  name: string;
  keywords: string[];
}

export interface Config {
  feature_groups: FeatureGroup[];
  valid_ids: string[];
}

export interface CleanedSignal extends RawSignal {
  severity_score: number;
  version_flagged: boolean;
  /** What it cost the customer. Assigned by Agent 1 alongside severity. */
  consequence: Consequence;
}

export interface TaggedSignal extends CleanedSignal {
  feature_group_id: string;
  theme_id: string;
  theme_label: string;
  trend_direction: TrendDirection;
}

export interface Theme {
  theme_id: string;
  theme_label: string;
  trend_direction: TrendDirection;
  signals: TaggedSignal[];
}

export interface ScoredTheme {
  theme_id: string;
  theme_label: string;
  feature_group_id: string;
  trend_direction: TrendDirection;
  signal_count: number;
  /** Reach component = signal_count. Kept as a named field for clarity in the API. */
  reach: number;
  /** Impact component = avg severity score across this theme's signals. */
  impact: number;
  /** Confidence component derived from source diversity. */
  confidence: number;
  /** Version-flagged ratio multiplier (1.0–1.2). */
  version_multiplier: number;
  /** Effort denominator (defaults to group-level effort, 0.8 for regression group, 1 otherwise). */
  effort: number;
  /** Trend multiplier applied at theme level (worsening 1.2 / stable 1.0 / improving 0.8). */
  trend_multiplier: number;
  /**
   * System score = reach × impact × confidence × version_multiplier.
   *
   * `effort` and `trend_multiplier` are still computed and stored below, but
   * they no longer multiply into this number (FORMULA_VERSION 2). Effort only
   * ever takes two values and only moves when a regression is flagged for the
   * whole group, so it is a regression discount rather than an effort estimate
   * — and it applies equally to every theme in that group, which reorders
   * nothing. Trend is derived from week-over-week movement, which is not
   * trustworthy while two runs can land in the same week.
   */
  system_rice: number;
  /** Highest-ranking consequence present among this theme's signals. */
  consequence: Consequence;
  /** How many of this theme's signals carry that consequence. */
  consequence_count: number;
  /** Counted facts about this theme's signals. See ThemeEvidence. */
  evidence: ThemeEvidence;
  /** Percentile cuts across every theme in the run — not inherited from the group. */
  moscow: MoSCoW;
  /** Deterministic readiness from the same 4 criteria Agent 5 uses. AI-assessed value wins for top-group themes (set in run.ts). */
  readiness: Readiness;
  /** @deprecated use `system_rice`. Kept for backward compat with the existing `top_rice_score` selector. */
  theme_score: number;
}

export interface ThemeBreakdownEntry extends ScoredTheme {
  gap_reasons?: string[];
  recommended_next_steps?: string[];
  /** Agent 6 output. Absent on themes that were not READY, and on older rows. */
  headline?: string;
  mechanism?: string[];
  first_move?: FirstMove;
  options?: MoveOption[];
  options_leftover?: string;
}

export interface EffortOverride {
  theme_id: string;
  week_id: string;
  effort: number;
  updated_at: string;
}

export interface FeedbackEntry {
  theme_id: string;
  week_id: string;
  rating: 'useful' | 'not_useful';
  recipient: string;
  submitted_at: string;
}

export interface Delta {
  /** null when last week's row used a different scoring formula. */
  rice_delta: number | null;
  rice_delta_pct: number | null;
  /**
   * False when the prior row's `Formula Version` differs from this run's, so
   * the UI can say "not comparable" instead of publishing a movement that is
   * really just the formula changing underneath.
   */
  scores_comparable: boolean;
  signal_delta: number;
  severity_delta: number;
  moscow_changed: boolean;
  moscow_prev: MoSCoW | null;
  moscow_escalated: boolean;
  moscow_deescalated: boolean;
}

export interface ScoredGroup {
  feature_group_id: string;
  top_rice_score: number;
  avg_severity: number;
  signal_count: number;
  confidence: number;
  version_multiplier: number;
  effort: number;
  trend_direction: TrendDirection;
  trend_multiplier: number;
  top_theme: string;
  scored_themes: ScoredTheme[];
  top_moscow: MoSCoW;
  delta: Delta | null;
}

export interface ThemeReadiness {
  theme_id: string;
  theme_label: string;
  readiness: Readiness;
  criteria: {
    signal_volume: CriteriaLevel;
    source_diversity: CriteriaLevel;
    severity_consistency: CriteriaLevel;
    trend_signal: CriteriaLevel;
  };
  gap_reasons: string[];
  recommended_next_steps: string[];
}

export interface ReadinessResult {
  group_id: string;
  overall_readiness: Readiness;
  readiness_summary: string;
  themes: ThemeReadiness[];
}

export interface GroupSummary {
  group_id: string;
  group_name: string;
  rank: number;
  rice_score: number;
  moscow: MoSCoW;
  trend_direction: TrendDirection;
  signal_count: number;
  avg_severity: number;
  severity_delta: number | null;
  themes: Array<{
    theme_id: string;
    theme_label: string;
    trend_direction: TrendDirection;
    signal_count: number;
    top_signal: string;
  }>;
  top_signals: string[];
}

export interface TopGroupView extends ScoredGroup {
  group_id: string;
  group_name?: string;
  readiness?: Readiness;
  readiness_summary?: string;
  theme_readiness?: ThemeReadiness[];
}

export interface PipelineResult {
  status: 'complete';
  weekId: string;
  signalCount: number;
  topGroup: string;
  topRiceScore: number;
  topMoscow: MoSCoW;
  overallReadiness: Readiness | undefined;
  regressionCount: number;
  /** Signals Agent 1 dropped as near-duplicates this run (A7). */
  droppedDuplicate: number;
  /** Signals Agent 1 dropped as irrelevant/spam this run (A7). */
  droppedIrrelevant: number;
  completedAt: string;
}

export interface RunOptions {
  recipient_email: string;
  /** Per-run override of USE_MOCK: true = mock fixture (Sample), false = live
   *  ingestion. Falls back to env.USE_MOCK when undefined. Lets the dashboard's
   *  Sample/Live toggle decide what a triggered run ingests. */
  use_mock?: boolean;
}
