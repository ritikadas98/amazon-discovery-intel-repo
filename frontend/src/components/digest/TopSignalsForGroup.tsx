import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { severityTier } from '@/lib/colors';
import { toNumber } from '@/lib/parsers';
import { useScopedLinkBuilder } from '@/lib/url-state';
import type { SignalRow } from '@/types';

interface Props {
  signals: SignalRow[];
  limit?: number;
}

const SOURCE_LABEL: Record<string, string> = {
  app_store: 'App Store',
  play_store: 'Play Store',
  amazon_review: 'Amazon Review',
};

export function TopSignalsForGroup({ signals, limit = 5 }: Props) {
  const buildLink = useScopedLinkBuilder();
  const top = [...signals]
    .sort((a, b) => toNumber(b['Severity Score']) - toNumber(a['Severity Score']))
    .slice(0, limit);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-sm">Top Signals</CardTitle>
        <Button asChild variant="ghost" size="sm" className="-mr-2">
          <Link to={buildLink('/signals')}>
            All signals
            <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No signals for this group this week.</p>
        ) : (
          <ul className="space-y-2.5">
            {top.map((s) => {
              const sev = toNumber(s['Severity Score']);
              const tier = severityTier(sev);
              return (
                <li key={s.ID || s.row_number} className="flex gap-3 items-start">
                  <Badge
                    variant="outline"
                    className={cn('font-mono tabular-nums shrink-0 mt-0.5', tier.className)}
                  >
                    {sev.toFixed(1)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-foreground line-clamp-2" title={s.Text}>
                      {s.Text}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      <span className="font-medium">{SOURCE_LABEL[s.Source] ?? s.Source}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-mono">{s.Date}</span>
                      {s['Theme Label'] && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span className="italic">{s['Theme Label']}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
