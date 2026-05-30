import type {
  DigestRow,
  MoSCoW,
  MoscowEntry,
  ReadinessResult,
  Readiness,
  RiceScoreEntry,
  TrendDirection,
  WoWDeltaEntry,
} from '@/types';

const MOSCOW_VALUES: ReadonlySet<MoSCoW> = new Set(['Must Have', 'Should Have', 'Could Have', "Won't Have"]);
const TREND_VALUES: ReadonlySet<TrendDirection> = new Set(['worsening', 'stable', 'improving']);
const READINESS_VALUES: ReadonlySet<Readiness> = new Set(['READY', 'NEEDS_MORE_EVIDENCE', 'BLOCKED']);

function safeParseArray<T>(raw: string | undefined | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function safeParseObject<T>(raw: string | undefined | null): T | null {
  if (!raw || raw === '{}') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function toNumber(raw: string | undefined | null, fallback = 0): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function toMoscow(raw: string | undefined | null): MoSCoW | null {
  return raw && MOSCOW_VALUES.has(raw as MoSCoW) ? (raw as MoSCoW) : null;
}

export function toTrend(raw: string | undefined | null): TrendDirection | null {
  return raw && TREND_VALUES.has(raw as TrendDirection) ? (raw as TrendDirection) : null;
}

export function toReadiness(raw: string | undefined | null): Readiness | null {
  return raw && READINESS_VALUES.has(raw as Readiness) ? (raw as Readiness) : null;
}

export interface ParsedDigest {
  weekId: string;
  topGroupId: string;
  topTheme: string;
  topRiceScore: number;
  topMoscow: MoSCoW | null;
  avgSeverity: number;
  signalCount: number;
  trend: TrendDirection | null;
  riceScores: RiceScoreEntry[];
  moscow: MoscowEntry[];
  wow: WoWDeltaEntry[];
  readiness: ReadinessResult | null;
  overallReadiness: Readiness | null;
  themesReadyCount: number;
  themesBlockedCount: number;
  dataQualityWarning: string;
  createdAt: string;
  rowNumber: number;
}

/** Decode a "Weekly Digests" row from the sheet (all strings + 4 JSON-encoded blobs). */
export function parseDigestRow(row: DigestRow): ParsedDigest {
  return {
    weekId: row['Week ID'] ?? '',
    topGroupId: row['Feature Group ID'] ?? '',
    topTheme: row['Top Theme'] ?? '',
    topRiceScore: toNumber(row['Top RICE Score']),
    topMoscow: toMoscow(row['Top MoSCoW']),
    avgSeverity: toNumber(row['Avg Severity']),
    signalCount: toNumber(row['Signal Count']),
    trend: toTrend(row['Trend Direction']),
    riceScores: safeParseArray<RiceScoreEntry>(row['RICE Scores JSON']),
    moscow: safeParseArray<MoscowEntry>(row['MoSCoW JSON']),
    wow: safeParseArray<WoWDeltaEntry>(row['WoW Delta JSON']),
    readiness: safeParseObject<ReadinessResult>(row['Discovery Readiness JSON']),
    overallReadiness: toReadiness(row['Overall Group Readiness']),
    themesReadyCount: toNumber(row['Themes Ready Count']),
    themesBlockedCount: toNumber(row['Themes Blocked Count']),
    dataQualityWarning: row['Data Quality Warning'] ?? '',
    createdAt: row['Created At'] ?? '',
    rowNumber: toNumber(row.row_number),
  };
}

/** Feature-group ID → human label. Mirrors backend's featureGroups.ts. */
export const FEATURE_GROUP_NAMES: Record<string, string> = {
  search_discovery: 'Search & Discovery',
  checkout_payment: 'Checkout & Payment',
  delivery_tracking: 'Delivery & Tracking',
  returns_refunds: 'Returns & Refunds',
  product_detail: 'Product Detail Pages',
  prime_subscriptions: 'Prime & Subscriptions',
  account_performance: 'Account & Performance',
};

export function featureGroupName(id: string): string {
  return FEATURE_GROUP_NAMES[id] ?? id;
}
