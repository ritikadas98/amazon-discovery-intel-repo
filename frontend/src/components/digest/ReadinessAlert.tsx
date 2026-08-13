import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReadinessBadge } from '@/components/common/StatusBadges';
import { READINESS_LABEL } from '@/lib/vocabulary';
import type { ThemeBreakdownEntry } from '@/types';

interface Props {
  /**
   * The full theme breakdown, not the top group's readiness blob.
   *
   * This panel used to read Discovery Readiness JSON, which the pipeline only ever
   * filled in for the highest-ranked group. Every other group rendered a badge with no
   * reason beside it — a panel whose entire job is explaining, explaining nothing.
   * The breakdown now carries gaps and next steps for every theme, with a deterministic
   * fallback when the model returns none.
   */
  themes: ThemeBreakdownEntry[];
}

export function ReadinessAlert({ themes }: Props) {
  const [open, setOpen] = useState(false);

  const problematic = themes.filter(
    (t) => t.readiness === 'NEEDS_MORE_EVIDENCE' || t.readiness === 'BLOCKED',
  );
  if (problematic.length === 0) return null;

  const blockedCount = problematic.filter((t) => t.readiness === 'BLOCKED').length;
  const needsCount = problematic.length - blockedCount;

  return (
    <Card className="overflow-hidden border-amber-500/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        )}
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 text-sm">
          <span className="font-medium text-foreground">What the evidence can&rsquo;t support yet</span>{' '}
          <span className="text-muted-foreground">
            {needsCount > 0 && `${needsCount} ${needsCount === 1 ? 'theme needs' : 'themes need'} more evidence`}
            {needsCount > 0 && blockedCount > 0 && ' · '}
            {blockedCount > 0 && `${blockedCount} not enough to act on`}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="pointer-events-none" tabIndex={-1}>
          {open ? 'Collapse' : 'Expand'}
        </Button>
      </button>

      {open && (
        <CardContent className="border-t bg-card pt-3 pb-4 space-y-2">
          {problematic.map((t) => (
            <div key={t.theme_id} className="rounded-md border bg-background px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium leading-snug">{t.theme_label}</p>
                <ReadinessBadge value={t.readiness} className="shrink-0" />
              </div>
              {t.gap_reasons?.length ? (
                <p className="text-xs text-muted-foreground mt-1.5">
                  <span className="font-medium">Why {READINESS_LABEL[t.readiness].toLowerCase()}:</span>{' '}
                  {t.gap_reasons.join(' ')}
                </p>
              ) : null}
              {t.recommended_next_steps?.length ? (
                <p className="text-xs text-primary/80 mt-1">
                  <span className="font-medium">What to do:</span> {t.recommended_next_steps[0]}
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
