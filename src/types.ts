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
  trend_direction: TrendDirection;
  signal_count: number;
  theme_score: number;
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
}
