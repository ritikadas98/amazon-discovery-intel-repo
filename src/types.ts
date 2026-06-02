export type Source = 'app_store' | 'play_store' | 'amazon_review' | 'unknown';

export type TrendDirection = 'worsening' | 'stable' | 'improving';
export type MoSCoW = 'Must Have' | 'Should Have' | 'Could Have' | "Won't Have";
export type Readiness = 'READY' | 'NEEDS_MORE_EVIDENCE' | 'BLOCKED';
export type CriteriaLevel = 'strong' | 'moderate' | 'weak';

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
  /** System-computed RICE = (reach × impact × confidence × version_multiplier) / effort × trend_multiplier. */
  system_rice: number;
  /** Inherited from the parent group's MoSCoW after percentile cuts. */
  moscow: MoSCoW;
  /** Deterministic readiness from the same 4 criteria Agent 5 uses. AI-assessed value wins for top-group themes (set in run.ts). */
  readiness: Readiness;
  /** @deprecated use `system_rice`. Kept for backward compat with the existing `top_rice_score` selector. */
  theme_score: number;
}

export interface ThemeBreakdownEntry extends ScoredTheme {
  gap_reasons?: string[];
  recommended_next_steps?: string[];
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
  rice_delta: number;
  rice_delta_pct: number | null;
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
  completedAt: string;
}

export interface RunOptions {
  recipient_email: string;
  /** Per-run override of USE_MOCK: true = mock fixture (Sample), false = live
   *  ingestion. Falls back to env.USE_MOCK when undefined. Lets the dashboard's
   *  Sample/Live toggle decide what a triggered run ingests. */
  use_mock?: boolean;
}
