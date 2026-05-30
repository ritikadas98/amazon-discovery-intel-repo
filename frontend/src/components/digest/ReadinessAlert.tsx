import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { READINESS_CLASS } from '@/lib/colors';
import type { ThemeReadiness } from '@/types';

interface Props {
  /** Themes from Discovery Readiness JSON (top group only; others are deterministic). */
  themes: ThemeReadiness[];
}

export function ReadinessAlert({ themes }: Props) {
  const [open, setOpen] = useState(false);

  const problematic = themes.filter((t) => t.readiness === 'NEEDS_MORE_EVIDENCE' || t.readiness === 'BLOCKED');
  if (problematic.length === 0) return null;

  const blockedCount = problematic.filter((t) => t.readiness === 'BLOCKED').length;
  const needsCount = problematic.length - blockedCount;

  return (
    <Card className="overflow-hidden border-amber-500/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />}
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="flex-1 text-sm">
          <span className="font-medium text-foreground">Discovery readiness gaps</span>{' '}
          <span className="text-muted-foreground">
            {needsCount > 0 && `${needsCount} theme${needsCount === 1 ? '' : 's'} needs more evidence`}
            {needsCount > 0 && blockedCount > 0 && ' · '}
            {blockedCount > 0 && `${blockedCount} blocked`}
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
                <Badge variant="outline" className={cn('shrink-0 text-[10px] py-0 px-1.5 h-5', READINESS_CLASS[t.readiness])}>
                  {t.readiness.replace(/_/g, ' ')}
                </Badge>
              </div>
              {t.gap_reasons?.length ? (
                <p className="text-xs text-muted-foreground mt-1.5">
                  <span className="font-medium">Gaps:</span> {t.gap_reasons.join(' · ')}
                </p>
              ) : null}
              {t.recommended_next_steps?.length ? (
                <p className="text-xs text-primary/80 mt-1">
                  <span className="font-medium">Next:</span> {t.recommended_next_steps[0]}
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
