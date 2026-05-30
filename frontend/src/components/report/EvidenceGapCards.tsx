import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ThemeBreakdownEntry } from '@/types';

interface Props {
  themes: ThemeBreakdownEntry[];
}

export function EvidenceGapCards({ themes }: Props) {
  const gapsOnly = themes.filter(
    (t) => t.readiness === 'NEEDS_MORE_EVIDENCE' || t.readiness === 'BLOCKED',
  );

  if (gapsOnly.length === 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-3 px-4 flex items-center gap-2.5 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">No discovery gaps detected for this group.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Evidence Gaps
      </h3>
      {gapsOnly.map((t) => (
        <div
          key={t.theme_id}
          className="rounded-md border border-red-500/30 border-l-4 border-l-red-500 bg-red-500/5 px-4 py-3"
        >
          <p className="text-sm font-semibold leading-snug">{t.theme_label}</p>
          {t.gap_reasons?.length ? (
            <p className="text-xs text-muted-foreground mt-1.5">
              <span className="font-medium text-foreground/80">Gap:</span> {t.gap_reasons.join(' · ')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1.5">
              <span className="font-medium text-foreground/80">Gap:</span> {t.readiness === 'BLOCKED' ? 'Insufficient signal volume or source diversity.' : 'Promising but needs more data.'}
            </p>
          )}
          {t.recommended_next_steps?.length ? (
            <p className="text-xs text-primary/90 mt-1.5">
              → {t.recommended_next_steps[0]}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
