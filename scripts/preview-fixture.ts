/**
 * Serve a digest built by the real scoring code, with no Gemini call.
 *
 * The deployed backend still runs the previous pipeline and the sheet still holds rows
 * from it, so pointing the SPA at production shows the old output. This runs
 * calculateRice + formatDigestRow over the fixture signals and serves the result on the
 * API shape the frontend expects — enough to see the UI against genuinely new output
 * without spending Vertex credits or touching the sheet.
 *
 *   npx tsx scripts/preview-fixture.ts     → http://localhost:8787
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';

import { config } from '../src/config/featureGroups.js';
import { calculateRice } from '../src/pipeline/rice.js';
import { formatDigestRow } from '../src/pipeline/format.js';
import type { ThemeDiagnosis } from '../src/types.js';
import { CONSEQUENCE_ORDER, type Consequence, type Meta, type TaggedSignal, type Theme } from '../src/types.js';

const PORT = 8787;
const WEEK = '2026-W33';

interface FixtureSignal {
  text: string;
  source: string;
  date?: string;
  rating?: number | null;
  severity_score?: number;
  feature_group_id?: string;
  theme_label?: string;
  app_version?: string | null;
}

const raw: FixtureSignal[] = JSON.parse(readFileSync(new URL('../data/signals.json', import.meta.url), 'utf-8'));

/**
 * Money is deliberately rare — about 1 in 40, against 1 in 13 lost and 1 in 5
 * blocked. The first pass used 1 in 11, and with 14 signals per theme almost
 * every theme caught one, so every row on the digest read "Lost money" and the
 * column stopped distinguishing anything. A worst-case roll-up only carries
 * information if the worst case is uncommon.
 */
function consequenceFor(i: number): Consequence {
  if (i % 40 === 0) return 'money';
  if (i % 13 === 0) return 'lost';
  if (i % 5 === 0) return 'blocked';
  return 'annoyance';
}

// The fixture has no themes (Gemini normally produces them), so group by feature group
// and split each into a couple of themes — enough shape to exercise the ranking.
const byGroup: Record<string, TaggedSignal[]> = {};
const themesPerGroup: Record<string, Theme[]> = {};

raw.forEach((s, i) => {
  // The fixture is raw, pre-tagging signals, so nothing carries a feature group.
  // Spread them unevenly across the real seven so the ranking has something to rank.
  const groupIds = config.feature_groups.map((g) => g.id);
  const groupId = s.feature_group_id || groupIds[(i * 7 + (i % 5)) % groupIds.length];
  const themeIdx = i % 2;
  const themeId = `${groupId}_t${themeIdx}`;
  const sig: TaggedSignal = {
    text: s.text,
    source: (s.source as TaggedSignal['source']) ?? 'play_store',
    date: s.date ?? '2026-08-11',
    rating: s.rating ?? null,
    severity_raw: null,
    app_version: s.app_version ?? null,
    severity_score: s.severity_score ?? 3.0 + ((i % 5) * 0.4),
    version_flagged: i % 7 === 0,
    // Agent 1 assigns this from the review text; there is no Gemini on this
    // path, so spread the four tiers deterministically. Skewed towards the
    // cheap end on purpose — money is meant to be the rare one, and a preview
    // where every theme screams "lost money" would not show the ranking doing
    // any work.
    consequence: consequenceFor(i),
    feature_group_id: groupId,
    theme_id: themeId,
    theme_label: s.theme_label || `${groupId.replace(/_/g, ' ')} issue ${themeIdx + 1}`,
    trend_direction: i % 3 === 0 ? 'worsening' : i % 3 === 1 ? 'stable' : 'improving',
  };
  (byGroup[groupId] ||= []).push(sig);
});

for (const [groupId, signals] of Object.entries(byGroup)) {
  const map = new Map<string, TaggedSignal[]>();
  for (const s of signals) (map.get(s.theme_id) ?? map.set(s.theme_id, []).get(s.theme_id)!).push(s);
  themesPerGroup[groupId] = [...map.entries()].map(([theme_id, sigs]) => ({
    theme_id,
    theme_label: sigs[0].theme_label,
    trend_direction: sigs[0].trend_direction,
    signals: sigs,
  }));
}

const meta: Meta = {
  weekId: WEEK,
  sourceBreakdown: { play_store: raw.length, app_store: 0, amazon_review: 0 } as Meta['sourceBreakdown'],
  dataQualityWarning: 'App Store reviews unavailable.',
  regressions: [],
  dataSource: 'Sample',
};

const scoredGroups = calculateRice(byGroup, themesPerGroup, meta);
const topGroup = scoredGroups[0];

// Agent 6 output, written by hand because this path makes no Gemini call.
//
// It exists so the "What we think is going on" panel can be reviewed at all
// locally — without it the panel is correctly absent and there is nothing to
// look at. The wording is deliberately generic: this is a layout fixture, not
// a finding, and nobody should mistake it for one. Real runs replace it.
const topReadyTheme = scoredGroups[0]?.scored_themes.find((t) => t.readiness === 'READY');
const diagnoses: ThemeDiagnosis[] = topReadyTheme
  ? [
      {
        theme_id: topReadyTheme.theme_id,
        headline: `${topReadyTheme.signal_count} customers hit the same problem in one week.`,
        mechanism: [
          'Sample fixture text — a real run replaces this with a reading of the actual reviews.',
          'Two different failures may be wearing one label here; the counted panel beside this is real.',
        ],
        firstMove: {
          kind: 'query',
          action: 'Sample fixture move — a real run names the metric and the build here.',
          owner: 'Data',
          effort: 'about a day',
          rationale:
            'A query, not a fix. It turns anecdotes into a rate before anyone commits engineering time, and if the rate held flat this drops.',
        },
      },
    ]
  : [];

const row = formatDigestRow({
  weekId: WEEK,
  topGroup,
  topGroupTopTheme: topGroup.top_theme,
  scoredGroups,
  // No Gemini here — this is exactly the path where the deterministic fallback copy
  // has to carry the explanation, so previewing without it is the point.
  readiness: null,
  diagnoses,
  allThemeReadiness: [],
  themesReady: 0,
  themesBlocked: 0,
  meta,
});

const signalRows = Object.values(byGroup)
  .flat()
  .map((s, i) => ({
    ID: `${WEEK}-${i}`,
    Text: s.text,
    Source: s.source,
    Date: s.date,
    Rating: s.rating,
    'Severity Score': s.severity_score,
    Consequence: s.consequence,
    'Feature Group ID': s.feature_group_id,
    'Theme ID': s.theme_id,
    'Theme Label': s.theme_label,
    'Week ID': WEEK,
    'App Version': s.app_version || '',
    'Version Flagged': s.version_flagged ? 'TRUE' : 'FALSE',
    'Created At': new Date().toISOString(),
    'Data Source': 'Sample',
  }));

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // The client sends Content-Type on GETs, which makes every request non-simple and
    // triggers a preflight. Without these two headers the browser blocks the call and
    // the page renders its empty state, which looks exactly like "no data" — answer it.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    res.setHeader('Content-Type', 'application/json');
    const path = (req.url || '').split('?')[0];
    if (path.startsWith('/digests')) return res.end(JSON.stringify({ rows: [row] }));
    if (path.startsWith('/signals')) return res.end(JSON.stringify({ rows: signalRows }));
    if (path.startsWith('/effort')) return res.end(JSON.stringify({ week: WEEK, overrides: [] }));
    res.end(JSON.stringify({ rows: [] }));
  })
  .listen(PORT, () => {
    console.log(`fixture API on http://localhost:${PORT}`);
    console.log(`groups=${scoredGroups.length} themes=${scoredGroups.flatMap((g) => g.scored_themes).length}`);
    for (const g of scoredGroups) {
      const t = g.scored_themes[0];
      console.log(
        `  ${g.feature_group_id.padEnd(22)} ${String(g.top_rice_score).padStart(7)}  ` +
          `${g.top_moscow.padEnd(12)} ${t ? `${t.consequence} ${t.consequence_count}/${t.signal_count}` : ''}`,
      );
    }
    console.log(`\nconsequence tiers in play: ${CONSEQUENCE_ORDER.join(', ')}`);
    console.log('Point the SPA at this with VITE_API_BASE_URL=http://localhost:8787');
  });
