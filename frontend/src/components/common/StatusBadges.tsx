import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MOSCOW_CLASS, READINESS_CLASS } from '@/lib/colors';
import { MOSCOW_HINT, READINESS_HINT, READINESS_LABEL } from '@/lib/vocabulary';
import type { MoSCoW, Readiness } from '@/types';

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
