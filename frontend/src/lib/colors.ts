// Feature group palette (locked in plan). Hex codes used for inline styles
// (chart bars, dots, left-borders, pills); Tailwind classes are used for
// backgrounds and text where appropriate.

export interface GroupColor {
  hex: string;
  /** Light-mode background — pairs well with the hex text. */
  bgClass: string;
  /** Tailwind text colour for dark-mode-friendly contrast. */
  textClass: string;
  /** Border colour for left-bordered cards. */
  borderClass: string;
}

export const GROUP_COLORS: Record<string, GroupColor> = {
  search_discovery: {
    hex: '#3b82f6',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-600 dark:text-blue-400',
    borderClass: 'border-blue-500/40',
  },
  checkout_payment: {
    hex: '#ef4444',
    bgClass: 'bg-red-500/10',
    textClass: 'text-red-600 dark:text-red-400',
    borderClass: 'border-red-500/40',
  },
  delivery_tracking: {
    hex: '#f97316',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-600 dark:text-orange-400',
    borderClass: 'border-orange-500/40',
  },
  returns_refunds: {
    hex: '#f59e0b',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-amber-500/40',
  },
  product_detail: {
    hex: '#8b5cf6',
    bgClass: 'bg-violet-500/10',
    textClass: 'text-violet-600 dark:text-violet-400',
    borderClass: 'border-violet-500/40',
  },
  prime_subscriptions: {
    hex: '#10b981',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-emerald-500/40',
  },
  account_performance: {
    hex: '#ec4899',
    bgClass: 'bg-pink-500/10',
    textClass: 'text-pink-600 dark:text-pink-400',
    borderClass: 'border-pink-500/40',
  },
};

const FALLBACK: GroupColor = {
  hex: '#64748b',
  bgClass: 'bg-slate-500/10',
  textClass: 'text-slate-600 dark:text-slate-400',
  borderClass: 'border-slate-500/40',
};

export function groupColor(id: string | null | undefined): GroupColor {
  if (!id) return FALLBACK;
  return GROUP_COLORS[id] ?? FALLBACK;
}

// ─── Severity 5-tier (per spec) ───────────────────────────────────────────────

export interface SeverityTier {
  label: string;
  /** Tailwind pill classes (light + dark variants). */
  className: string;
}

export function severityTier(score: number): SeverityTier {
  if (score >= 5) return { label: 'critical', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' };
  if (score >= 4) return { label: 'high', className: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' };
  if (score >= 3) return { label: 'moderate', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' };
  if (score >= 2) return { label: 'low', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400' };
  return { label: 'minor', className: 'bg-gray-100 text-gray-600 dark:bg-slate-500/15 dark:text-slate-400' };
}

// ─── MoSCoW colors (per spec) ─────────────────────────────────────────────────

import type { MoSCoW, Readiness } from '@/types';

export const MOSCOW_CLASS: Record<MoSCoW, string> = {
  'Must Have': 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  'Should Have': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  'Could Have': 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  "Won't Have": 'bg-gray-100 text-gray-500 dark:bg-slate-500/15 dark:text-slate-400',
};

export const READINESS_CLASS: Record<Readiness, string> = {
  READY: 'bg-green-100 text-green-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  NEEDS_MORE_EVIDENCE: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  BLOCKED: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

/** Group-level readiness summary maps to PARTIAL/NOT_READY labels (per locked decision). */
export const GROUP_READINESS_LABEL: Record<Readiness, 'READY' | 'PARTIAL' | 'NOT_READY'> = {
  READY: 'READY',
  NEEDS_MORE_EVIDENCE: 'PARTIAL',
  BLOCKED: 'NOT_READY',
};

export const GROUP_READINESS_CLASS: Record<'READY' | 'PARTIAL' | 'NOT_READY', string> = {
  READY: 'bg-green-100 text-green-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  PARTIAL: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  NOT_READY: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

// ─── Trend (worsening / stable / improving) ──────────────────────────────────

export const TREND_CLASS: Record<string, string> = {
  worsening: 'text-red-600 dark:text-red-400',
  stable: 'text-slate-500 dark:text-slate-400',
  improving: 'text-emerald-600 dark:text-emerald-400',
};

export const TREND_ARROW: Record<string, string> = {
  worsening: '↑',
  stable: '→',
  improving: '↓',
};
