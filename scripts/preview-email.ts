/**
 * Render the digest email to a file, so it can be looked at rather than trusted.
 *
 * A template that compiles is not a template that reads well: the failures that
 * matter here are a wrong label, a dead link, or a "First run" on week 40 —
 * none of which a typechecker can see.
 *
 *   npx tsx scripts/preview-email.ts   ->  scripts/out/digest-email.html
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderDigestEmail } from '../src/templates/digestEmail.js';
import type { GroupSummary, Meta, TopGroupView } from '../src/types.js';

const WEEK = '2026-W33';

const group = (over: Partial<GroupSummary>): GroupSummary =>
  ({
    group_id: 'checkout_payment',
    group_name: 'Checkout & Payment',
    rank: 1,
    rice_score: 16,
    moscow: 'Must Have',
    trend_direction: 'worsening',
    signal_count: 5,
    avg_severity: 4.0,
    severity_delta: null,
    themes: [
      { theme_id: 't4', theme_label: 'Payment processing', trend_direction: 'worsening', signal_count: 5, top_signal: 'It will not let me pay with my gift card' },
    ],
    top_signals: ['It will not let me pay with my gift card'],
    ...over,
  }) as GroupSummary;

const groupSummaries: GroupSummary[] = [
  group({
    headline: 'Four of five customers could not pay. One was charged twice.',
    consequence: 'money',
    consequence_count: 1,
    first_move: {
      kind: 'query',
      action: 'Query checkout completion rate on build 27.13.0 against the previous build, segmented by payment method.',
      owner: 'Data',
      effort: 'about a day',
      rationale:
        'A query, not a fix. It turns 5 anecdotes into a rate before anyone commits engineering time, and if the rate held flat this drops.',
    },
  }),
  // Second group deliberately has a delta, which proves this is NOT a first run —
  // so the first group's null must read as "not comparable", not "First run".
  group({
    group_id: 'delivery_tracking',
    group_name: 'Delivery & Tracking',
    rank: 2,
    rice_score: 18,
    moscow: 'Should Have',
    severity_delta: 3.2,
    consequence: 'lost',
    consequence_count: 3,
    signal_count: 10,
    avg_severity: 3.0,
  }),
];

const meta = {
  weekId: WEEK,
  sourceBreakdown: { app_store: 41, play_store: 78, amazon_review: 3, unknown: 0, total: 122 },
  dataQualityWarning: null,
  regressions: [],
  dataSource: 'Live',
} as Meta;

const topGroup = {
  group_id: 'checkout_payment',
  group_name: 'Checkout & Payment',
  readiness: 'READY',
  readiness_summary: 'One theme clears the evidence bar this week.',
  theme_readiness: [],
} as unknown as TopGroupView;

const { subject, html } = renderDigestEmail({
  groupSummaries,
  topGroup,
  signalCount: 122,
  weekId: WEEK,
  meta,
  readiness: {
    group_id: 'checkout_payment',
    overall_readiness: 'READY',
    readiness_summary: 'One theme clears the evidence bar this week.',
    themes: [
      {
        theme_id: 't4',
        theme_label: 'Payment processing and cart issues',
        readiness: 'READY',
        criteria: { signal_volume: 'strong', source_diversity: 'moderate', severity_consistency: 'strong', trend_signal: 'strong' },
        gap_reasons: ['Feedback comes from only two app stores.'],
        recommended_next_steps: ['Check whether support has tickets matching this in the same week.'],
      },
    ],
  },
  baseUrl: 'https://amazon-discovery-34n34tq6za-el.a.run.app',
  appUrl: 'https://amazon.ritikadas.in',
  recipientEmail: 'ritikadas98@gmail.com',
});

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const out = new URL('./out/digest-email.html', import.meta.url);
writeFileSync(out, html, 'utf-8');

console.log('subject:', subject);
console.log('written:', out.pathname);
for (const [label, needle] of [
  ['leads with the finding', 'could not pay'],
  ['action block', 'DO THIS FIRST'],
  ['primary CTA', 'Open the digest'],
  ['group deep link', 'amazon.ritikadas.in/digest?group='],
  ['three-way feedback', 'Not this week'],
  ['consequence shown', 'Lost money'],
  ['no stale RICE label', 'RICE'],
  ['not-comparable wording', 'Not comparable with last week'],
] as const) {
  const found = html.includes(needle);
  const want = label === 'no stale RICE label' ? !found : found;
  console.log(`  ${want ? 'PASS' : 'FAIL'}  ${label}`);
}
