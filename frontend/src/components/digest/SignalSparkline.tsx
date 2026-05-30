import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { groupColor } from '@/lib/colors';
import type { SignalRow } from '@/types';

interface Props {
  /** Signals to aggregate by Date. Already filtered to the active group/week if applicable. */
  signals: SignalRow[];
  /** Color for the line; falls back to neutral if 'all'. */
  groupId: string;
}

function buildDailySeries(signals: SignalRow[]): Array<{ date: string; count: number }> {
  if (signals.length === 0) return [];

  // Build a map from YYYY-MM-DD → count
  const counts: Record<string, number> = {};
  for (const s of signals) {
    if (!s.Date || !/^\d{4}-\d{2}-\d{2}$/.test(s.Date)) continue;
    counts[s.Date] = (counts[s.Date] ?? 0) + 1;
  }
  const dates = Object.keys(counts).sort();
  if (dates.length === 0) return [];

  // Fill missing days between min and max (up to 7 days back from max)
  const max = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  const start = new Date(max);
  start.setUTCDate(max.getUTCDate() - 6);

  const out: Array<{ date: string; count: number }> = [];
  for (let d = new Date(start); d <= max; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: counts[key] ?? 0 });
  }
  return out;
}

function shortDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function SignalSparkline({ signals, groupId }: Props) {
  const series = useMemo(() => buildDailySeries(signals), [signals]);
  const color = groupId === 'all' ? '#64748b' : groupColor(groupId).hex;

  const chartConfig = {
    count: {
      label: 'Signals',
      color,
    },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signal Volume — Last 7 Days</CardTitle>
        <CardDescription>
          Daily count of signals for this week{groupId !== 'all' ? ' in the selected group' : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No daily data available.</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[180px] w-full">
            <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickFormatter={shortDateLabel}
                tick={{ fontSize: 11 }}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={28} />
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={(v) => shortDateLabel(String(v))} />}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-count)', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
