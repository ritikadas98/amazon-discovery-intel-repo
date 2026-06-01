import { Link } from 'react-router-dom';
import { ArrowRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MOSCOW_CLASS, READINESS_CLASS, TREND_CLASS } from '@/lib/colors';
import { useScopedLinkBuilder } from '@/lib/url-state';
import type { ThemeBreakdownEntry, TrendDirection } from '@/types';

interface Props {
  themes: ThemeBreakdownEntry[];
}

function trendIcon(d: TrendDirection) {
  if (d === 'worsening') return <TrendingUp className="h-3 w-3" />;
  if (d === 'improving') return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

export function ThemeListForGroup({ themes }: Props) {
  const buildLink = useScopedLinkBuilder();
  const sorted = [...themes].sort((a, b) => b.system_rice - a.system_rice);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-sm">Themes in this group</CardTitle>
          <CardDescription>
            Sorted by system RICE. Click a theme to deep-dive in the Discovery Report.
          </CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm" className="-mr-2 shrink-0">
          <Link to={buildLink('/report')}>
            Full report
            <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No theme breakdown yet for this group.
            <br />
            <span className="text-xs">
              The Theme Breakdown JSON column on the Weekly Digests sheet is empty for this week.
              Redeploy the backend and run the pipeline once to populate it.
            </span>
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((t) => (
              <div key={t.theme_id} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium leading-snug flex-1">{t.theme_label}</p>
                  <span className="font-mono tabular-nums text-sm font-semibold shrink-0">
                    {t.system_rice.toFixed(1)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', MOSCOW_CLASS[t.moscow])}>
                    {t.moscow}
                  </Badge>
                  <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', READINESS_CLASS[t.readiness])}>
                    {t.readiness.replace(/_/g, ' ')}
                  </Badge>
                  <span className={cn('inline-flex items-center gap-0.5 text-[11px]', TREND_CLASS[t.trend_direction])}>
                    {trendIcon(t.trend_direction)}
                    {t.trend_direction}
                  </span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {t.signal_count} signal{t.signal_count === 1 ? '' : 's'} · sev {t.impact.toFixed(1)}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                  <span>R {t.reach}</span>
                  <span>I {t.impact.toFixed(1)}</span>
                  <span>C {t.confidence.toFixed(1)}</span>
                  <span>E {t.effort}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
