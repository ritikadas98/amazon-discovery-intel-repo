import type { RawSignal, Meta, Source, SourceBreakdown } from '../types.js';

const VALID_SOURCES: Source[] = ['app_store', 'play_store', 'amazon_review'];

function weekIdFor(now: Date): string {
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export interface NormalizeResult {
  signals: RawSignal[];
  meta: Meta;
}

/** Mirrors the "Normalize Schema" node: validation, defaults, weekId, dataQualityWarning. */
export function normalize(raw: RawSignal[], now: Date = new Date()): NormalizeResult {
  const today = now.toISOString().split('T')[0];
  const weekId = weekIdFor(now);

  const normalized: RawSignal[] = [];
  for (const d of raw) {
    const text = (d.text || '').trim();
    if (text.length < 10) continue;

    const source = (VALID_SOURCES as string[]).includes(d.source) ? d.source : ('unknown' as Source);

    let date = d.date || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today;

    const rating =
      d.rating !== null && d.rating !== undefined && !Number.isNaN(d.rating)
        ? Math.min(5, Math.max(1, Number(d.rating)))
        : null;

    normalized.push({
      text,
      source,
      date,
      rating,
      severity_raw: null,
      app_version: d.app_version || null,
    });
  }

  const breakdown: SourceBreakdown = {
    app_store: 0,
    play_store: 0,
    amazon_review: 0,
    unknown: 0,
    total: 0,
  };
  for (const s of normalized) {
    breakdown[s.source] = (breakdown[s.source] || 0) + 1;
    breakdown.total++;
  }

  const warnings: string[] = [];
  if (breakdown.total < 40) {
    warnings.push(`Low signal volume: only ${breakdown.total} signals collected (minimum 40 expected).`);
  }
  if (breakdown.amazon_review === 0) warnings.push('Amazon reviews unavailable.');
  if (breakdown.app_store === 0) warnings.push('App Store reviews unavailable.');
  const dataQualityWarning = warnings.length ? warnings.join(' ') : null;

  const meta: Meta = {
    weekId,
    sourceBreakdown: breakdown,
    dataQualityWarning,
    regressions: [],
    dataSource: 'Live', // default; run.ts overrides based on USE_MOCK
  };

  return { signals: normalized, meta };
}
