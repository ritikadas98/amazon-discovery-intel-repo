import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MOSCOW_CLASS } from '@/lib/colors';
import { featureGroupName } from '@/lib/parsers';
import type { ThemeBreakdownEntry } from '@/types';

interface Props {
  themes: ThemeBreakdownEntry[];
  groupId: string;
}

/** Pick a one-line action per theme based on its readiness state. */
function defaultAction(t: ThemeBreakdownEntry): string {
  if (t.recommended_next_steps?.length) return t.recommended_next_steps[0];
  if (t.readiness === 'READY') return 'Move to solution scoping; assemble a small discovery doc.';
  if (t.readiness === 'NEEDS_MORE_EVIDENCE') return 'Collect more signals (target +5 from a second source) before committing.';
  return 'Hold until evidence improves; revisit next week.';
}

export function NextStepsList({ themes, groupId }: Props) {
  const sorted = [...themes].sort((a, b) => b.system_rice - a.system_rice).slice(0, 5);
  if (sorted.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wider">
          Recommended next steps — {featureGroupName(groupId)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {sorted.map((t, i) => (
            <li key={t.theme_id} className="flex gap-3">
              <span className="text-sm font-mono text-muted-foreground tabular-nums w-5 shrink-0 pt-0.5">{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2 mb-0.5">
                  <span className="font-medium text-sm">{t.theme_label}</span>
                  <span className="text-xs text-muted-foreground font-mono">RICE {t.system_rice.toFixed(1)}</span>
                  <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', MOSCOW_CLASS[t.moscow])}>
                    {t.moscow}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{defaultAction(t)}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
