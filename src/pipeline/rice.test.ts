import { describe, expect, it } from 'vitest';

import type { Meta, ScoredTheme, Source, TaggedSignal, Theme } from '../types.js';
import { calculateRice } from './rice.js';

/**
 * These tests exist because of a real defect, not for coverage.
 *
 * The UI printed a theme's RICE components as `R 26 · I 3.4 · C 0.8 · E 1` beside a
 * score of 85.6. Those four numbers multiply to 70.7. Two factors — version and trend
 * — were applied by the pipeline and never shown, so anyone who checked the arithmetic
 * concluded the score was decorative. On a project whose whole claim is "every number
 * is worked out in code", that was the most expensive kind of bug.
 *
 * The first test below asserts the identity the UI now renders. If someone adds a
 * factor to the formula without adding it to the card, this fails.
 */

function signal(overrides: Partial<TaggedSignal> = {}): TaggedSignal {
  return {
    text: 'Package arrived four days late with no tracking updates.',
    source: 'play_store' as Source,
    date: '2026-08-11',
    rating: 1,
    severity_raw: null,
    app_version: null,
    severity_score: 3.4,
    version_flagged: false,
    consequence: 'annoyance',
    feature_group_id: 'delivery_tracking',
    theme_id: 'theme_a',
    theme_label: 'Delivery Delays',
    trend_direction: 'stable',
    ...overrides,
  };
}

function theme(id: string, label: string, signals: TaggedSignal[], trend: Theme['trend_direction'] = 'stable'): Theme {
  return { theme_id: id, theme_label: label, trend_direction: trend, signals };
}

const meta: Meta = {
  weekId: '2026-W33',
  sourceBreakdown: {} as Meta['sourceBreakdown'],
  dataQualityWarning: null,
  regressions: [],
  dataSource: 'Sample',
};

/** A run shaped like the real one: a dominant group and a near-empty one. */
function buildRun() {
  const big = Array.from({ length: 26 }, (_, i) =>
    signal({ severity_score: 3.4, version_flagged: i < 1, source: i % 2 === 0 ? 'play_store' : ('app_store' as Source) }),
  );
  const tiny = Array.from({ length: 4 }, () =>
    signal({ theme_id: 'theme_b', theme_label: 'Unclassified', severity_score: 1.0, feature_group_id: 'delivery_tracking' }),
  );
  const other = Array.from({ length: 9 }, () =>
    signal({ theme_id: 'theme_c', theme_label: 'Returns', severity_score: 2.5, feature_group_id: 'returns_refunds' }),
  );

  return calculateRice(
    { delivery_tracking: [...big, ...tiny], returns_refunds: other },
    {
      delivery_tracking: [theme('theme_a', 'Delivery Delays', big, 'worsening'), theme('theme_b', 'Unclassified', tiny)],
      returns_refunds: [theme('theme_c', 'Returns', other)],
    },
    meta,
  );
}

function allThemes(): ScoredTheme[] {
  return buildRun().flatMap((g) => g.scored_themes);
}

describe('RICE', () => {
  it('every published component multiplies back to the published score', () => {
    for (const t of allThemes()) {
      // FORMULA_VERSION 2: four factors, and all four are printed on the card.
      // Effort and trend are still stored but no longer multiplied in, so they
      // are deliberately absent here.
      const rebuilt = t.reach * t.impact * t.confidence * t.version_multiplier;

      // Exact to the printed precision. The components are rounded before the score is
      // computed from them, so what a reader multiplies is what a reader is shown —
      // there is no rounding slack left to hide a missing factor in.
      expect(Math.round(rebuilt * 10) / 10).toBe(t.system_rice);
    }
  });

  it('still stores effort and trend even though they no longer score', () => {
    const worsening = allThemes().find((t) => t.trend_direction === 'worsening');
    expect(worsening?.trend_multiplier).toBe(1.2);
    expect(worsening?.effort).toBe(1);
    // The proof they are inert: the score is free of both.
    expect(worsening?.system_rice).toBe(
      Math.round(worsening!.reach * worsening!.impact * worsening!.confidence * worsening!.version_multiplier * 10) / 10,
    );
  });

  /**
   * The claim printed on the digest is that dropping the two factors reordered
   * nothing. Effort is a property of the group, so it divides every theme in
   * that group equally; trend is per theme, so in principle it *can* reorder —
   * this asserts that on the shape of run we actually get, it does not.
   */
  it('dropping effort and trend leaves the ranking unchanged', () => {
    const themes = allThemes();
    const byNew = [...themes].sort((a, b) => b.system_rice - a.system_rice).map((t) => t.theme_id);
    const byOld = [...themes]
      .sort((a, b) => {
        const old = (t: ScoredTheme) =>
          ((t.reach * t.impact * t.confidence * t.version_multiplier) / t.effort) * t.trend_multiplier;
        return old(b) - old(a);
      })
      .map((t) => t.theme_id);
    expect(byNew).toEqual(byOld);
  });

  it('a theme takes the most costly consequence present, not the most common', () => {
    const themes = allThemes();
    // Every fixture signal is 'annoyance', so nothing should claim otherwise.
    expect(themes.every((t) => t.consequence === 'annoyance')).toBe(true);

    // One money signal among many annoyances must win the roll-up.
    const mixed = calculateRice(
      { checkout_payment: [signal({ consequence: 'money' }), signal(), signal()] },
      {
        checkout_payment: [
          theme('theme_pay', 'Payment', [signal({ consequence: 'money' }), signal(), signal()]),
        ],
      },
      meta,
    );
    const t = mixed[0].scored_themes[0];
    expect(t.consequence).toBe('money');
    expect(t.consequence_count).toBe(1);
  });
});

describe('MoSCoW', () => {
  it('does not give one group a single label for wildly different themes', () => {
    const delivery = buildRun().find((g) => g.feature_group_id === 'delivery_tracking');
    const labels = new Set(delivery!.scored_themes.map((t) => t.moscow));

    // The regression this guards: a theme scoring ~2 and one scoring ~85 both read
    // "Must Have" because every theme inherited its group's label.
    expect(labels.size).toBeGreaterThan(1);
  });

  it('never marks the weakest theme in the run a Must Have', () => {
    const themes = allThemes().sort((a, b) => a.system_rice - b.system_rice);
    expect(themes[0].moscow).not.toBe('Must Have');
  });

  it('still scores groups on their own spread', () => {
    const groups = buildRun();
    expect(groups[0].top_moscow).toBe('Must Have');
  });
});
