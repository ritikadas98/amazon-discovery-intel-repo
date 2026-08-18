import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScoredGroup, Source, TaggedSignal, Theme } from '../types.js';

const callGemini = vi.fn();
vi.mock('../lib/gemini.js', () => ({
  callGemini: (...args: unknown[]) => callGemini(...args),
  parseJsonOrThrow: <T>(text: string, label: string): T => {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${label}: Vertex AI returned invalid JSON: ${text.slice(0, 80)}`);
    }
  },
}));

const { assessReadiness, countableCriteria, contradictsCounts } = await import('./readiness.js');

function signal(themeId: string): TaggedSignal {
  return {
    text: 'Parcel arrived four days late and tracking never updated.',
    source: 'play_store' as Source,
    date: '2026-08-11',
    rating: 1,
    severity_raw: null,
    app_version: null,
    severity_score: 3.4,
    version_flagged: false,
    consequence: 'annoyance',
    feature_group_id: 'delivery_tracking',
    theme_id: themeId,
    theme_label: themeId,
    trend_direction: 'stable',
    ...({} as Record<string, never>),
  };
}

const themesPerGroup: Record<string, Theme[]> = {
  delivery_tracking: [
    { theme_id: 'theme_a', theme_label: 'Delays', trend_direction: 'worsening', signals: [signal('theme_a')] },
    { theme_id: 'theme_b', theme_label: 'Tracking', trend_direction: 'stable', signals: [signal('theme_b')] },
  ],
  returns_refunds: [
    { theme_id: 'theme_c', theme_label: 'Refunds', trend_direction: 'stable', signals: [signal('theme_c')] },
  ],
};

const scoredGroups = [
  { feature_group_id: 'delivery_tracking' },
  { feature_group_id: 'returns_refunds' },
] as ScoredGroup[];

const criteria = {
  signal_volume: 'weak',
  source_diversity: 'weak',
  severity_consistency: 'moderate',
  trend_signal: 'strong',
};

function themeReply(id: string, readiness = 'NEEDS_MORE_EVIDENCE') {
  return {
    theme_id: id,
    theme_label: id,
    readiness,
    criteria,
    gap_reasons: ['Only one person has raised this.'],
    recommended_next_steps: ['Watch it for another week.'],
  };
}

beforeEach(() => callGemini.mockReset());

describe('assessReadiness', () => {
  it('covers every group, not just the top one', async () => {
    callGemini.mockResolvedValue(
      JSON.stringify({
        groups: [
          { group_id: 'delivery_tracking', overall_readiness: 'NEEDS_MORE_EVIDENCE', readiness_summary: 's', themes: [themeReply('theme_a'), themeReply('theme_b')] },
          { group_id: 'returns_refunds', overall_readiness: 'BLOCKED', readiness_summary: 's', themes: [themeReply('theme_c', 'BLOCKED')] },
        ],
      }),
    );

    const out = await assessReadiness({ scoredGroups, themesPerGroup });

    // The regression this guards: six groups out of seven used to come back with no
    // assessment at all, so their badges rendered with nothing beside them.
    expect(out.allThemeReadiness.map((t) => t.theme_id).sort()).toEqual(['theme_a', 'theme_b', 'theme_c']);
    expect(out.readiness.group_id).toBe('delivery_tracking');
  });

  it('drops themes the model invented rather than surfacing phantoms', async () => {
    callGemini.mockResolvedValue(
      JSON.stringify({
        groups: [
          {
            group_id: 'delivery_tracking',
            overall_readiness: 'READY',
            readiness_summary: 's',
            themes: [themeReply('theme_a'), themeReply('theme_HALLUCINATED')],
          },
        ],
      }),
    );

    const out = await assessReadiness({ scoredGroups, themesPerGroup });
    expect(out.allThemeReadiness.map((t) => t.theme_id)).toEqual(['theme_a']);
  });

  it('asks for enough output tokens to hold every theme', async () => {
    callGemini.mockResolvedValue(
      JSON.stringify({ groups: [{ group_id: 'delivery_tracking', overall_readiness: 'READY', readiness_summary: 's', themes: [] }] }),
    );

    await assessReadiness({ scoredGroups, themesPerGroup });

    // The live failure: one response now covers every theme in the run, and the 8192
    // default was spent before the model finished — with 'medium' thinking taking half
    // of it before a single output token, because thinking bills against the same cap.
    const opts = callGemini.mock.calls[0][1] as { maxOutputTokens: number; thinkingLevel: string };
    expect(opts.maxOutputTokens).toBeGreaterThanOrEqual(32768);
    expect(opts.thinkingLevel).toBe('minimal');
  });

  it('surfaces a bad response instead of returning half a result', async () => {
    callGemini.mockResolvedValue('not json at all');
    await expect(assessReadiness({ scoredGroups, themesPerGroup })).rejects.toThrow(/invalid JSON/);
  });
});

describe('countable criteria are arithmetic, not judgement', () => {
  it('grades the real W34 flagship theme on its actual counts', () => {
    // 53 signals across App Store and Play Store. The model called this
    // "only one person, only one source" and scored the evidence weak.
    expect(countableCriteria(53, 2)).toEqual({
      signal_volume: 'strong',
      source_diversity: 'moderate',
    });
  });

  it('still calls a genuinely thin theme weak', () => {
    expect(countableCriteria(1, 1)).toEqual({
      signal_volume: 'weak',
      source_diversity: 'weak',
    });
  });
});

describe('contradictsCounts', () => {
  it('catches the two sentences that reached production', () => {
    expect(contradictsCounts('Only one person reported this issue.', 53, 2)).toBe(true);
    expect(contradictsCounts('The feedback comes from only one source.', 53, 2)).toBe(true);
  });

  it('leaves the same sentences alone when they are true', () => {
    expect(contradictsCounts('Only one person reported this issue.', 1, 1)).toBe(false);
    expect(contradictsCounts('The feedback comes from only one source.', 9, 1)).toBe(false);
  });

  it('does not flag unrelated gaps', () => {
    expect(contradictsCounts('The people who mentioned it were not especially unhappy.', 53, 2)).toBe(false);
  });
});
