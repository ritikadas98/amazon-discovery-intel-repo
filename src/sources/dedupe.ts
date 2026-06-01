import { appendRows, readRows } from '../lib/sheets.js';
import { getEnv } from '../config/env.js';
import type { RawSignal } from '../types.js';

/**
 * Cross-run dedup against the "Seen Signal IDs" sheet tab.
 * Columns: `Source ID`, `Seen At`.
 *
 * Flow in run.ts: loadSeenIds() → filterUnseen() before analysis →
 * commitSeenIds() ONLY after the Signals rows are successfully written, so a
 * mid-run failure re-ingests next time rather than silently dropping reviews.
 */

export async function loadSeenIds(): Promise<Set<string>> {
  const env = getEnv();
  try {
    const rows = await readRows(env.SHEETS_SEEN_SIGNALS_TAB);
    return new Set(rows.map((r) => r['Source ID']).filter(Boolean));
  } catch (err) {
    // Missing tab / read error → treat everything as new (fail open). The first
    // run after creating the tab will then populate it.
    console.warn(
      `[dedupe] could not read "${env.SHEETS_SEEN_SIGNALS_TAB}"; treating all as new:`,
      err instanceof Error ? err.message : err,
    );
    return new Set();
  }
}

/** Drop signals whose source_id is already seen (or duplicated within this batch). */
export function filterUnseen(signals: RawSignal[], seen: Set<string>): RawSignal[] {
  const out: RawSignal[] = [];
  const thisBatch = new Set<string>();
  for (const s of signals) {
    const id = s.source_id;
    if (!id) {
      out.push(s); // no id → can't dedup; keep it
      continue;
    }
    if (seen.has(id) || thisBatch.has(id)) continue;
    thisBatch.add(id);
    out.push(s);
  }
  return out;
}

/** Append the given signals' source_ids to the Seen Signal IDs tab. */
export async function commitSeenIds(signals: RawSignal[]): Promise<void> {
  const env = getEnv();
  const now = new Date().toISOString();
  const rows = signals
    .map((s) => s.source_id)
    .filter((id): id is string => !!id)
    .map((id) => ({ 'Source ID': id, 'Seen At': now }));
  if (rows.length === 0) return;
  await appendRows(env.SHEETS_SEEN_SIGNALS_TAB, rows);
}
