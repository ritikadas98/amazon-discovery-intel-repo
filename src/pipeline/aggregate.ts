import type { TaggedSignal, Theme } from '../types.js';

export interface AggregatedBuckets {
  byGroup: Record<string, TaggedSignal[]>;
  themesPerGroup: Record<string, Theme[]>;
}

/** Mirrors "Aggregate by Group": bucketize tagged signals by feature_group_id and theme_id. */
export function aggregateByGroup(signals: TaggedSignal[]): AggregatedBuckets {
  const byGroup: Record<string, TaggedSignal[]> = {};
  for (const signal of signals) {
    const gid = signal.feature_group_id || 'account_performance';
    if (!byGroup[gid]) byGroup[gid] = [];
    byGroup[gid].push(signal);
  }

  const themesByGroup: Record<string, Record<string, Theme>> = {};
  for (const signal of signals) {
    const gid = signal.feature_group_id || 'account_performance';
    if (!themesByGroup[gid]) themesByGroup[gid] = {};
    const tid = signal.theme_id || 'unclassified';
    if (!themesByGroup[gid][tid]) {
      themesByGroup[gid][tid] = {
        theme_id: tid,
        theme_label: signal.theme_label || 'Unclassified',
        trend_direction: signal.trend_direction || 'stable',
        signals: [],
      };
    }
    themesByGroup[gid][tid].signals.push(signal);
  }

  const themesPerGroup: Record<string, Theme[]> = {};
  for (const [gid, themes] of Object.entries(themesByGroup)) {
    themesPerGroup[gid] = Object.values(themes);
  }

  return { byGroup, themesPerGroup };
}
