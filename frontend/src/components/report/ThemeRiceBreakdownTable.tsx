import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { MOSCOW_CLASS, READINESS_CLASS } from '@/lib/colors';
import { api } from '@/lib/api';
import { SegmentedEffortSelector } from './SegmentedEffortSelector';
import type { EffortOverride, ThemeBreakdownEntry } from '@/types';

interface Props {
  themes: ThemeBreakdownEntry[];
  weekId: string;
  overrides: EffortOverride[];
}

/** PM-adjusted RICE per spec: (Reach × Impact × Confidence) / chosen_effort */
function adjustedRice(t: ThemeBreakdownEntry, effort: number): number {
  if (effort <= 0) return 0;
  return Math.round(((t.reach * t.impact * t.confidence) / effort) * 10) / 10;
}

export function ThemeRiceBreakdownTable({ themes, weekId, overrides }: Props) {
  const queryClient = useQueryClient();

  const overrideByThemeId = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of overrides) m.set(o.theme_id, o.effort);
    return m;
  }, [overrides]);

  const setEffortMutation = useMutation({
    mutationFn: ({ theme_id, effort }: { theme_id: string; effort: number }) =>
      api.setEffort(theme_id, weekId, effort),
    onSuccess: (_data, variables) => {
      // Optimistically reflect the new override (without a refetch round-trip).
      queryClient.setQueryData<{ week: string | null; overrides: EffortOverride[] }>(
        ['effort', weekId],
        (prev) => {
          const next = (prev?.overrides ?? []).filter((o) => o.theme_id !== variables.theme_id);
          next.push({
            theme_id: variables.theme_id,
            week_id: weekId,
            effort: variables.effort,
            updated_at: new Date().toISOString(),
          });
          return { week: weekId, overrides: next };
        },
      );
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not save effort';
      toast.error('Effort not saved', { description: message });
    },
  });

  const sorted = [...themes].sort((a, b) => b.system_rice - a.system_rice);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme RICE Breakdown</CardTitle>
        <CardDescription>
          Edit the Effort column to recompute PM-adjusted RICE in real time.
          PM-adjusted RICE = (Reach × Impact × Confidence) / chosen effort.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Theme</TableHead>
              <TableHead className="text-right">R</TableHead>
              <TableHead className="text-right">I</TableHead>
              <TableHead className="text-right">C</TableHead>
              <TableHead>Effort</TableHead>
              <TableHead className="text-right">RICE (system)</TableHead>
              <TableHead className="text-right">RICE (PM)</TableHead>
              <TableHead>MoSCoW</TableHead>
              <TableHead>Readiness</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No themes in this group's breakdown.
                </TableCell>
              </TableRow>
            )}
            {sorted.map((t) => {
              const effortValue = overrideByThemeId.get(t.theme_id) ?? t.effort;
              const pmRice = adjustedRice(t, effortValue);
              return (
                <TableRow key={t.theme_id}>
                  <TableCell className="text-sm">
                    <p className="font-medium leading-tight">{t.theme_label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{t.theme_id}</p>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.reach}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.impact.toFixed(1)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{t.confidence.toFixed(1)}</TableCell>
                  <TableCell>
                    <SegmentedEffortSelector
                      value={effortValue}
                      onChange={(v) => setEffortMutation.mutate({ theme_id: t.theme_id, effort: v })}
                      disabled={setEffortMutation.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {t.system_rice.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-semibold">
                    {pmRice.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', MOSCOW_CLASS[t.moscow])}>
                      {t.moscow}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', READINESS_CLASS[t.readiness])}>
                      {t.readiness.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
