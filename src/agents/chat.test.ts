import { describe, expect, it } from 'vitest';

import { compactThemes } from './chat.js';

/**
 * The chat is the one surface where a system conclusion can be laundered into
 * "customers said". A prompt rule alone is weak, so the payload is shaped to
 * make the rule easy to follow: customer words exist in exactly one place.
 * These tests assert that shape, and guard the size of what it costs.
 */

function themeEntry(over: Record<string, unknown> = {}) {
  return {
    theme_id: 't4',
    theme_label: 'Payment processing and cart issues',
    feature_group_id: 'checkout_payment',
    trend_direction: 'worsening',
    signal_count: 5,
    impact: 4.0,
    system_rice: 16,
    readiness: 'READY',
    gap_reasons: ['Feedback comes from only two app stores.'],
    recommended_next_steps: ['Pull the completion rate.'],
    headline: 'Four of five customers could not pay.',
    mechanism: ['This is a conversion problem, not a billing problem.'],
    first_move: {
      kind: 'query',
      action: 'Query checkout completion rate.',
      owner: 'Data',
      effort: 'about a day',
      rationale: 'Turns anecdotes into a rate.',
    },
    evidence: {
      sources: [{ source: 'app_store', count: 4 }],
      topVersion: { version: '27.13.0', count: 4 },
      consequences: [{ consequence: 'money', count: 1 }],
      quotes: [{ text: 'It will not let me pay with my gift card', source: 'app_store', severity: 3.5 }],
      dateRange: { first: '2026-08-12', last: '2026-08-13' },
    },
    ...over,
  };
}

function row(themes: unknown[]) {
  return { 'Week ID': '2026-W33', 'Theme Breakdown JSON': JSON.stringify(themes) };
}

describe('compactThemes', () => {
  it('separates what was said, what was counted and what was inferred', () => {
    const [t] = compactThemes(row([themeEntry()]));

    expect(t.said).toEqual([
      { text: 'It will not let me pay with my gift card', source: 'app_store' },
    ]);
    expect(t.counted.complaints).toBe(5);
    expect(t.counted.by_consequence).toEqual([{ consequence: 'money', count: 1 }]);
    expect(t.inferred.headline).toBe('Four of five customers could not pay.');
    expect(t.inferred.mechanism).toEqual(['This is a conversion problem, not a billing problem.']);
  });

  /**
   * The load-bearing assertion. If a verbatim quote ever appears anywhere other
   * than `said`, the model can attribute a system sentence to a customer while
   * still technically quoting the payload.
   */
  it('puts customer words in exactly one place', () => {
    const [t] = compactThemes(row([themeEntry()]));
    const quote = 'It will not let me pay with my gift card';

    expect(JSON.stringify(t.said)).toContain(quote);
    expect(JSON.stringify(t.counted)).not.toContain(quote);
    expect(JSON.stringify(t.inferred)).not.toContain(quote);
  });

  it('carries the week in the citable ref, because theme ids repeat', () => {
    const [a, b] = compactThemes(row([themeEntry(), themeEntry({ feature_group_id: 'returns_refunds' })]));
    expect(a.ref).toBe('2026-W33/t4');
    // Same id, different group — the ref alone cannot disambiguate them, which
    // is why the prompt tells the model a ref is only unique within its week.
    expect(b.ref).toBe(a.ref);
  });

  it('leaves said empty rather than borrowing from inferred', () => {
    const [t] = compactThemes(row([themeEntry({ evidence: { sources: [], quotes: [] } })]));
    expect(t.said).toEqual([]);
    // The conclusion is still there — it just cannot be passed off as a quote.
    expect(t.inferred.headline).toBeTruthy();
  });

  it('survives a row with no evidence block at all', () => {
    const [t] = compactThemes(row([themeEntry({ evidence: undefined })]));
    expect(t.said).toEqual([]);
    expect(t.counted.complaints).toBe(5);
  });

  it('returns nothing for unparseable JSON rather than throwing', () => {
    expect(compactThemes({ 'Week ID': 'w', 'Theme Breakdown JSON': 'not json' })).toEqual([]);
  });

  /**
   * Adding quotes and mechanisms to every theme grows the prompt. The cap is
   * generous but real: three digests ride in each request, so this budget is
   * per-digest and the true cost is roughly triple.
   */
  it('stays within a sane prompt budget for a full run', () => {
    const themes = Array.from({ length: 15 }, (_, i) => themeEntry({ theme_id: `t${i}` }));
    const bytes = JSON.stringify(compactThemes(row(themes))).length;
    expect(bytes).toBeLessThan(20_000);
  });
});
