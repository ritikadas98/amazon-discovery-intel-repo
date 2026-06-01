import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { groupColor } from '@/lib/colors';
import { parseDigestRow } from '@/lib/parsers';
import { api } from '@/lib/api';

interface Props {
  groupId: string;
}

export function GroupRiceTrend({ groupId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['digests', 12],
    queryFn: () => api.digests(12),
  });

  const series = useMemo(() => {
    const rows = data?.rows ?? [];
    // /digests returns newest first; chart wants oldest left → newest right
    const points = rows.slice().reverse().map((r) => {
      const d = parseDigestRow(r);
      const entry = d.riceScores.find((e) => e.id === groupId);
      return {
        week: d.weekId,
        rice: entry ? entry.score : 0,
      };
    });
    return points.filter((p) => p.rice > 0);
  }, [data, groupId]);

  const color = groupColor(groupId).hex;
  const chartConfig = {
    rice: { label: 'RICE', color },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">RICE Trend — Last {Math.min(12, series.length || 12)} Weeks</CardTitle>
        <CardDescription>This group's top theme's RICE score across recent runs.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : series.length < 2 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Need at least 2 weekly runs to draw a trend. Run the pipeline again next week to see this.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[180px] w-full">
            <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis allowDecimals tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="rice"
                stroke="var(--color-rice)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-rice)', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
