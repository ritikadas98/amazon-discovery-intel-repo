import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { featureGroupName } from '@/lib/parsers';
import type { ParsedDigest } from '@/lib/parsers';
import type { MoSCoW } from '@/types';

const MOSCOW_PILL: Record<MoSCoW, string> = {
  'Must Have': 'bg-destructive/10 text-destructive border-destructive/30',
  'Should Have': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
  'Could Have': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  "Won't Have": 'bg-muted text-muted-foreground border-border',
};

const chartConfig = {
  score: {
    label: 'RICE',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

interface Props {
  digest: ParsedDigest;
}

export function FeatureGroupRankings({ digest }: Props) {
  if (digest.riceScores.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feature Group Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No RICE scores in this run.
          </p>
        </CardContent>
      </Card>
    );
  }

  const moscowById = new Map(digest.moscow.map((m) => [m.id, m.moscow]));
  const wowById = new Map(digest.wow.map((w) => [w.id, w.delta]));

  const data = [...digest.riceScores]
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({
      id: entry.id,
      name: featureGroupName(entry.id),
      score: entry.score,
      moscow: moscowById.get(entry.id) ?? null,
      wow: wowById.get(entry.id) ?? null,
    }));

  const chartHeight = Math.max(220, data.length * 44);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Group Rankings</CardTitle>
        <CardDescription>
          RICE = reach × severity × confidence × version-mult / effort × trend-mult.
          MoSCoW assigned by percentile cutoffs across this week's groups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChartContainer config={chartConfig} style={{ height: chartHeight }} className="w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={180}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <Bar dataKey="score" fill="var(--color-score)" radius={4}>
              <LabelList
                dataKey="score"
                position="right"
                offset={8}
                className="fill-foreground"
                fontSize={12}
                formatter={(value) => (typeof value === 'number' ? value.toFixed(1) : String(value ?? ''))}
              />
            </Bar>
          </BarChart>
        </ChartContainer>

        <div className="space-y-1.5 pt-2 border-t">
          {data.map((row, idx) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 text-sm py-1.5 px-2 rounded hover:bg-muted/40"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-muted-foreground tabular-nums w-6 shrink-0">
                  #{idx + 1}
                </span>
                <span className="font-medium truncate">{row.name}</span>
                {row.moscow && (
                  <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', MOSCOW_PILL[row.moscow])}>
                    {row.moscow}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {row.wow !== null && (
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      row.wow > 0 ? 'text-destructive' : row.wow < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                    )}
                  >
                    {row.wow > 0 ? '▲' : row.wow < 0 ? '▼' : '·'} {Math.abs(row.wow).toFixed(2)}
                  </span>
                )}
                <span className="font-mono tabular-nums w-12 text-right">{row.score.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
