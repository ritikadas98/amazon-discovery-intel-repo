import type { CleanedSignal, Regression } from '../types.js';

const REGRESSION_THRESHOLD = 5;

/** Mirrors "Regression Detection": group version-flagged signals by version, flag clusters ≥ threshold. */
export function detectRegressions(signals: CleanedSignal[]): Regression[] {
  const versionGroups: Record<string, CleanedSignal[]> = {};

  for (const signal of signals) {
    if (!signal.version_flagged) continue;
    const match = signal.text.match(/\b(\d+\.\d+[.\d]*)\b/);
    const version = match ? match[1] : 'unknown';
    if (!versionGroups[version]) versionGroups[version] = [];
    versionGroups[version].push(signal);
  }

  const regressions: Regression[] = [];
  for (const [version, vSignals] of Object.entries(versionGroups)) {
    if (vSignals.length >= REGRESSION_THRESHOLD) {
      regressions.push({
        version,
        signal_count: vSignals.length,
        top_signals: vSignals.slice(0, 3).map((s) => s.text),
        feature_groups_affected: [],
      });
    }
  }
  return regressions;
}
