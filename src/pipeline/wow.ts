import type { Delta, MoSCoW, ScoredGroup } from '../types.js';

const MOSCOW_ORDER: MoSCoW[] = ['Must Have', 'Should Have', 'Could Have', "Won't Have"];

function moscowRank(label: string | null): number {
  if (!label) return 99;
  const idx = MOSCOW_ORDER.indexOf(label as MoSCoW);
  return idx === -1 ? 99 : idx;
}

export type LastWeekLookup = Record<string, Record<string, string>>;

/**
 * Build a map of feature_group_id → last week's highest-RICE-score row.
 * Dedups by (Week ID, Feature Group ID, row_number) — matches the original behavior.
 */
export function buildLastWeekLookup(lastWeekData: Record<string, string>[]): LastWeekLookup {
  const seen = new Set<string>();
  const deduped = (lastWeekData || []).filter((r) => {
    const key = `${r['Week ID']}_${r['Feature Group ID']}_${r.row_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const lookup: LastWeekLookup = {};
  for (const row of deduped) {
    const gid = row['Feature Group ID'];
    if (!gid) continue;
    const existing = lookup[gid];
    const rowRice = parseFloat(row['Top RICE Score']) || 0;
    if (!existing || rowRice > (parseFloat(existing['Top RICE Score']) || 0)) {
      lookup[gid] = row;
    }
  }
  return lookup;
}

/** Mirrors "Assign MoSCoW" (Node 2 — WoW deltas). Mutates nothing; returns new array. */
export function assignWoWDeltas(scoredGroups: ScoredGroup[], lastWeekLookup: LastWeekLookup): ScoredGroup[] {
  return scoredGroups.map((group) => {
    const last = lastWeekLookup[group.feature_group_id] || null;
    if (!last) return { ...group, delta: null };

    const lastRice = parseFloat(last['Top RICE Score']) || 0;
    const lastSignalCount = parseInt(last['Signal Count'], 10) || 0;
    const lastAvgSeverity = parseFloat(last['Avg Severity']) || 0;
    const lastMoSCoW = (last['Top MoSCoW'] as MoSCoW) || null;

    const riceDelta = parseFloat((group.top_rice_score - lastRice).toFixed(1));
    const riceDeltaPct =
      lastRice !== 0 ? Math.round(((group.top_rice_score - lastRice) / lastRice) * 100) : null;
    const signalDelta = group.signal_count - lastSignalCount;
    const severityDelta = parseFloat((group.avg_severity - lastAvgSeverity).toFixed(2));

    const moscowChanged = lastMoSCoW !== null && group.top_moscow !== lastMoSCoW;
    const moscowEscalated = moscowChanged && moscowRank(group.top_moscow) < moscowRank(lastMoSCoW);
    const moscowDeescalated = moscowChanged && moscowRank(group.top_moscow) > moscowRank(lastMoSCoW);

    const delta: Delta = {
      rice_delta: riceDelta,
      rice_delta_pct: riceDeltaPct,
      signal_delta: signalDelta,
      severity_delta: severityDelta,
      moscow_changed: moscowChanged,
      moscow_prev: lastMoSCoW,
      moscow_escalated: moscowEscalated,
      moscow_deescalated: moscowDeescalated,
    };
    return { ...group, delta };
  });
}
