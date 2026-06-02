// Mirrors backend's response shapes. Source: backend src/types.ts + src/server.ts.

export type Source = 'app_store' | 'play_store' | 'amazon_review' | 'unknown';
export type TrendDirection = 'worsening' | 'stable' | 'improving';
export type MoSCoW = 'Must Have' | 'Should Have' | 'Could Have' | "Won't Have";
export type Readiness = 'READY' | 'NEEDS_MORE_EVIDENCE' | 'BLOCKED';

/** What POST /run-pipeline returns. */
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

/** A row from the "Weekly Digests" sheet (everything comes back as strings). */
export interface DigestRow {
  row_number: string;
  'Week ID': string;
  'Feature Group ID': string;
  'Top Theme': string;
  'Signal Count': string;
  'Avg Severity': string;
  'Trend Direction': TrendDirection | string;
  'Top RICE Score': string;
  'Top MoSCoW': MoSCoW | string;
  'RICE Scores JSON': string;
  'MoSCoW JSON': string;
  'Data Quality Warning': string;
  'WoW Delta JSON': string;
  'Trend Direction JSON'?: string;
  'Theme Breakdown JSON'?: string;
  'Created At': string;
  'Discovery Readiness JSON': string;
  'Overall Group Readiness': Readiness | string;
  'Themes Ready Count': string;
  'Themes Blocked Count': string;
  'Data Source'?: 'Sample' | 'Live' | string;
}

/** A row from the "Signals" sheet. */
export interface SignalRow {
  row_number: string;
  ID: string;
  Text: string;
  Source: Source | string;
  Date: string;
  Rating: string;
  'Severity Score': string;
  'Feature Group ID': string;
  'Theme ID': string;
  'Theme Label': string;
  'Week ID': string;
  'App Version': string;
  'Version Flagged': 'TRUE' | 'FALSE' | string;
  'Created At': string;
  'Data Source'?: 'Sample' | 'Live' | string;
}

/** GET /digests response envelope. */
export interface DigestsResponse {
  count: number;
  returned: number;
  rows: DigestRow[];
}

/** GET /signals response envelope. */
export interface SignalsResponse {
  count: number;
  returned: number;
  week: string | null;
  rows: SignalRow[];
}

/** Parsed shape of the "RICE Scores JSON" / "MoSCoW JSON" columns. */
export interface RiceScoreEntry {
  id: string;
  score: number;
}
export interface MoscowEntry {
  id: string;
  moscow: MoSCoW;
}

/** Parsed shape of "WoW Delta JSON" — full per-group delta record. */
export interface WoWDeltaEntry {
  id: string;
  rice_delta: number | null;
  rice_delta_pct: number | null;
  signal_delta: number | null;
  severity_delta: number | null;
  moscow_changed: boolean;
  moscow_prev: MoSCoW | null;
  moscow_escalated: boolean;
}

/** Parsed shape of "Trend Direction JSON". */
export interface TrendEntry {
  id: string;
  trend: TrendDirection;
}

/** Parsed shape of "Theme Breakdown JSON" — one entry per theme across all groups. */
export interface ThemeBreakdownEntry {
  theme_id: string;
  theme_label: string;
  feature_group_id: string;
  trend_direction: TrendDirection;
  signal_count: number;
  reach: number;
  impact: number;
  confidence: number;
  version_multiplier: number;
  effort: number;
  trend_multiplier: number;
  system_rice: number;
  moscow: MoSCoW;
  readiness: Readiness;
  gap_reasons?: string[];
  recommended_next_steps?: string[];
}

/** A row from the "Effort Estimates" sheet, normalised by GET /effort-overrides. */
export interface EffortOverride {
  theme_id: string;
  week_id: string;
  effort: number;
  updated_at: string;
}

export interface EffortOverridesResponse {
  week: string | null;
  overrides: EffortOverride[];
}

/** Parsed shape of "Discovery Readiness JSON". */
export interface ThemeReadiness {
  theme_id: string;
  theme_label: string;
  readiness: Readiness;
  criteria: {
    signal_volume: 'strong' | 'moderate' | 'weak';
    source_diversity: 'strong' | 'moderate' | 'weak';
    severity_consistency: 'strong' | 'moderate' | 'weak';
    trend_signal: 'strong' | 'moderate' | 'weak';
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
