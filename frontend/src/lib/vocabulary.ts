import type { Consequence, MoSCoW, Readiness, TrendDirection } from '@/types';

/**
 * One place that decides what every label on screen says.
 *
 * The same concept used to surface under two names and three registers: readiness
 * rendered as raw enum text ("NEEDS_MORE_EVIDENCE" → "NEEDS MORE EVIDENCE") on theme
 * rows, but as "PARTIAL" / "NOT_READY" on the group summary. "BLOCKED" was the worst
 * of them — it reads as a workflow state someone imposed, when it only ever meant
 * "not enough evidence yet".
 *
 * The wording here is for a reader who has never seen this dashboard. The framework
 * names still appear, but as the explanation rather than the headline.
 */

export const READINESS_LABEL: Record<Readiness, string> = {
  READY: 'Enough evidence',
  NEEDS_MORE_EVIDENCE: 'Needs more evidence',
  BLOCKED: 'Not enough to act on',
};

/** The one-line "so what" for a reader who does not know the rubric. */
export const READINESS_HINT: Record<Readiness, string> = {
  READY: 'Enough people, unhappy enough, from more than one place. Safe to take to a team.',
  NEEDS_MORE_EVIDENCE: 'Real, but thin. Worth watching another week before committing anyone.',
  BLOCKED: 'Too few reports, or not severe enough, to justify work yet.',
};

export const MOSCOW_HINT: Record<MoSCoW, string> = {
  'Must Have': 'In the top quarter of this week by score.',
  'Should Have': 'Above the middle of this week by score.',
  'Could Have': 'Below the middle of this week by score.',
  "Won't Have": 'In the bottom quarter of this week by score.',
};

export const TREND_LABEL: Record<TrendDirection, string> = {
  worsening: 'getting worse',
  stable: 'steady',
  improving: 'getting better',
};

/** Plain sentence for the top of a theme card, before any jargon. */
export function themeSummarySentence(signalCount: number, trend: TrendDirection): string {
  const people = signalCount === 1 ? '1 person raised this' : `${signalCount} people raised this`;
  return `${people}, ${TREND_LABEL[trend]}.`;
}

/**
 * How the score is built, in the order the equation multiplies.
 * Used by the "Show the scoring" panel and by the glossary so the two cannot disagree.
 */
export const SCORING_GLOSSARY: Array<{ term: string; plain: string }> = [
  { term: 'Reach', plain: 'How many people mentioned it this week.' },
  { term: 'Impact', plain: 'How unhappy they sounded, averaged, from 1 to 5. It rates the writing, not the damage.' },
  { term: 'Confidence', plain: 'How many different places it came from. One source scores 0.6, three score 1.0.' },
  { term: 'Version', plain: 'Nudges the score up when reports name a specific app version.' },
];

/**
 * Two factors used to multiply into the score and no longer do. They are still
 * computed and still stored — they were removed from the product, not deleted —
 * so the panel names them rather than letting a reader wonder where they went.
 */
export const RETIRED_SCORING_FACTORS: Array<{ term: string; plain: string }> = [
  {
    term: 'Effort',
    plain:
      'Only ever takes two values, and it belongs to the whole feature group, so it divided ' +
      'every theme in that group by the same amount and could not change their order. It was a ' +
      'regression discount wearing the name of an effort estimate. You set real effort yourself, ' +
      'in the report.',
  },
  {
    term: 'Trend',
    plain:
      'Comes from comparing this week against last, and two pipeline runs can land in the same ' +
      'week, so the comparison behind it is not sound. Across week 33 it was 1.2 on every scored ' +
      'theme, which is a constant by another name.',
  },
];

/**
 * What the number actually means to the person reading it.
 *
 * The score was printed bare — "34.6" — with nothing saying whether that is good, bad,
 * or out of a hundred. It is none of those: it is a relative position within this week's
 * run and has no meaning on its own. Saying so is the difference between a number a PM
 * can act on and a number they have to take on faith.
 */
export function scoreMeaning(score: number, topScore: number): string {
  if (topScore <= 0) return 'Only meaningful next to the other themes in this week.';
  if (score >= topScore) return 'The most worth your time this week, by this measure.';
  const ratio = score / topScore;
  if (ratio >= 0.75) return `Close to the top of this week — worth doing alongside it.`;
  if (ratio >= 0.4) return `About ${Math.round(ratio * 100)}% as pressing as this week's top theme.`;
  return `Well behind this week's top theme. Park it unless it is cheap to fix.`;
}

export const SCORE_CAVEAT =
  'The number is a ranking position, not a grade. It only means anything next to the ' +
  'other themes in the same week, and it moves when the mix of complaints moves.';

export const MOSCOW_CAVEAT =
  'Must / Should / Could / Won’t are cut from this week’s spread, not fixed thresholds. ' +
  'Something is always a Must Have, even in a quiet week.';

/**
 * What the problem cost the customer — the question severity does not answer.
 *
 * Severity rates how loud a review is. In week 33's checkout theme the one
 * signal where money actually moved wrongly scored 4.0, below two blocked
 * checkouts at 4.5, so ranking on severity alone puts the cheaper problem
 * first. This column is the corrective, and it is deliberately worded as an
 * outcome rather than a category.
 */
export const CONSEQUENCE_LABEL: Record<Consequence, string> = {
  money: 'Lost money',
  lost: 'Order never came',
  blocked: 'Couldn’t finish',
  annoyance: 'Just annoyed',
};

export const CONSEQUENCE_HINT: Record<Consequence, string> = {
  money: 'Money moved wrongly or is stuck — charged twice, charged after cancelling, refund not received.',
  lost: 'They paid and did not receive it.',
  blocked: 'They could not finish what they came to do.',
  annoyance: 'Nothing lost and nothing prevented. Slow, confusing, or unwanted.',
};

/**
 * Bands, not decimals.
 *
 * The score has no unit and no absolute scale — 16.0 only means anything
 * against this run's top of 22.0. Three of its four inputs are estimates, so
 * one decimal place claims a precision they cannot carry. Cuts are shares of
 * the top score in the same run for exactly that reason.
 */
export type ScoreBand = 'high' | 'medium' | 'low';

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function scoreBand(score: number, topScore: number): ScoreBand {
  if (topScore <= 0) return 'low';
  if (score >= 0.5 * topScore) return 'high';
  return score >= 0.15 * topScore ? 'medium' : 'low';
}

/** Spelled out so the panel and the tooltip cannot drift apart. */
export function scoreBandCaveat(topScore: number): string {
  const high = Math.round(0.5 * topScore * 10) / 10;
  const medium = Math.round(0.15 * topScore * 10) / 10;
  return (
    `High starts at ${high}, medium at ${medium} — both measured against the biggest problem ` +
    `this week, because the number means nothing on its own.`
  );
}

export const SCORES_NOT_COMPARABLE =
  'Not comparable with last week: the scoring formula changed between the two runs, so any ' +
  'movement here would be the formula changing rather than the problem.';
