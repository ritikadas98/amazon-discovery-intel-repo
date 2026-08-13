import type { MoSCoW, Readiness, TrendDirection } from '@/types';

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
  { term: 'Impact', plain: 'How unhappy they were, averaged, from 1 to 5.' },
  { term: 'Confidence', plain: 'How many different places it came from. One source scores 0.6, three score 1.0.' },
  { term: 'Version', plain: 'Nudges the score up when reports name a specific app version.' },
  { term: 'Effort', plain: 'Divides the score. Lower effort means a higher score.' },
  { term: 'Trend', plain: 'Multiplies by 1.2 if getting worse, 0.8 if getting better.' },
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
