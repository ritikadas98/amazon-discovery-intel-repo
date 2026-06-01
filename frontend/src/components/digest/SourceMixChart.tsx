import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SignalRow } from '@/types';

interface Props {
  signals: SignalRow[];
}

const SOURCE_LABEL: Record<string, string> = {
  app_store: 'App Store',
  play_store: 'Play Store',
  amazon_review: 'Amazon Review',
};

const SOURCE_BAR: Record<string, string> = {
  app_store: 'bg-blue-500',
  play_store: 'bg-emerald-500',
  amazon_review: 'bg-violet-500',
};

export function SourceMixChart({ signals }: Props) {
  const counts = useMemo(() => {
    const map: Record<string, number> = { app_store: 0, play_store: 0, amazon_review: 0 };
    for (const s of signals) {
      if (s.Source in map) map[s.Source] += 1;
    }
    return map;
  }, [signals]);

  const total = counts.app_store + counts.play_store + counts.amazon_review;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Signal Source Mix</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No signals this week.</p>
        ) : (
          <div className="space-y-2.5">
            {(['app_store', 'play_store', 'amazon_review'] as const).map((src) => {
              const n = counts[src];
              const pct = total === 0 ? 0 : Math.round((n / total) * 100);
              return (
                <div key={src}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{SOURCE_LABEL[src]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {n} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', SOURCE_BAR[src])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
