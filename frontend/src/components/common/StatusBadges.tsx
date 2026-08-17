import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CONSEQUENCE_CLASS, MOSCOW_CLASS, READINESS_CLASS, SCORE_BAND_CLASS } from '@/lib/colors';
import {
  CONSEQUENCE_HINT,
  CONSEQUENCE_LABEL,
  MOSCOW_HINT,
  READINESS_HINT,
  READINESS_LABEL,
  SCORE_BAND_LABEL,
  scoreBand,
  scoreBandCaveat,
} from '@/lib/vocabulary';
import type { Consequence, MoSCoW, Readiness } from '@/types';

/**
 * The badge markup was copy-pasted into five files, which is how readiness ended up
 * rendering its raw enum in some places and a friendlier label in others. One component
 * each, so the wording can only be changed in one place.
 *
 * `title` carries the plain-English meaning for anyone hovering — the glossary popover
 * says the same thing at length, this is the version you get without leaving the row.
 */

// 10px was unreadable on a phone. These carry the priority and the evidence quality —
// two of the three things the card is for — so they get real type, not footnote type.
const PILL = 'text-[12px] py-0.5 px-2 h-[22px] font-medium';

export function ReadinessBadge({ value, className }: { value: Readiness; className?: string }) {
  return (
    <Badge
      variant="outline"
      title={READINESS_HINT[value]}
      className={cn(PILL, READINESS_CLASS[value], className)}
    >
      {READINESS_LABEL[value]}
    </Badge>
  );
}

export function MoscowBadge({ value, className }: { value: MoSCoW; className?: string }) {
  return (
    <Badge variant="outline" title={MOSCOW_HINT[value]} className={cn(PILL, MOSCOW_CLASS[value], className)}>
      {value}
    </Badge>
  );
}

/**
 * The score as a band, with the number kept in the tooltip.
 *
 * The score has no unit and no absolute scale — 66.3 only means something
 * against this run's top. Three of its four inputs are estimates, so one
 * decimal place claims a precision they cannot carry. Anyone who wants the
 * figure can hover; anyone scanning the table gets the answer instead.
 */
export function ScoreBandBadge({
  score,
  topScore,
  className,
}: {
  score: number;
  topScore: number;
  className?: string;
}) {
  const band = scoreBand(score, topScore);
  return (
    <Badge
      variant="outline"
      title={`${score.toFixed(1)} of ${topScore.toFixed(1)} top this week. ${scoreBandCaveat(topScore)}`}
      className={cn(PILL, SCORE_BAND_CLASS[band], className)}
    >
      {SCORE_BAND_LABEL[band]}
    </Badge>
  );
}

/**
 * What it cost the customer, which the score deliberately does not measure.
 *
 * Colour tracks cost, not tone — money is the loudest thing on the row even
 * when the reviews behind it were calm. Rows written before this field existed
 * render nothing rather than a default, because "annoyance" would be a claim
 * the data never made.
 */
export function ConsequenceBadge({
  value,
  count,
  total,
  className,
}: {
  value?: Consequence;
  count?: number;
  total?: number;
  className?: string;
}) {
  if (!value) return null;
  const share = count != null && total != null ? ` ${count}/${total}` : '';
  return (
    <Badge
      variant="outline"
      title={CONSEQUENCE_HINT[value]}
      className={cn(PILL, CONSEQUENCE_CLASS[value], className)}
    >
      {CONSEQUENCE_LABEL[value]}
      {share}
    </Badge>
  );
}
