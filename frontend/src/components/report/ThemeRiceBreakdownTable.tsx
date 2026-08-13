import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoscowBadge, ReadinessBadge } from '@/components/common/StatusBadges';
import { api } from '@/lib/api';
import { SegmentedEffortSelector } from './SegmentedEffortSelector';
import type { EffortOverride, ThemeBreakdownEntry } from '@/types';

interface Props {
  themes: ThemeBreakdownEntry[];
  weekId: string;
  overrides: EffortOverride[];
}

/**
 * PM-adjusted RICE — the same formula the pipeline uses, with the PM's effort swapped in.
 *
 * This used to drop version_multiplier and trend_multiplier, so the two columns differed
 * even when the PM had changed nothing. A reader could only conclude one of them was
 * wrong. Effort is now the only thing that varies between them, which is the entire
 * point of letting a PM edit it.
 */
function adjustedRice(t: ThemeBreakdownEntry, effort: number): number {
  if (effort <= 0) return 0;
  const raw = ((t.reach * t.impact * t.confidence * t.version_multiplier) / effort) * t.trend_multiplier;
  return Math.round(raw * 10) / 10;
}

export function ThemeRiceBreakdownTable({ themes, weekId, overrides }: Props) {
  const queryClient = useQueryClient();

  const overrideByThemeId = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of overrides) m.set(o.theme_id, o.effort);
    return m;
  }, [overrides]);

  const setEffortMutation = useMutation({
    mutationFn: ({
      theme_id,
      effort,
      feature_group_id,
    }: {
      theme_id: string;
      effort: number;
      feature_group_id: string;
    }) => api.setEffort(theme_id, weekId, effort, feature_group_id),
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
        <CardTitle>Themes in this group</CardTitle>
        <CardDescription>
          Change the Effort column to see the score move. Both columns use the same
          formula &mdash; Reach &times; Impact &times; Confidence &times; version &divide; effort
          &times; trend &mdash; so effort is the only difference between them.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Theme</TableHead>
              {/* Single letters were unreadable to anyone who did not already know
                  RICE. The abbreviation stays in the tooltip for those who do. */}
              <TableHead className="text-right" title="Reach — how many people mentioned it">People</TableHead>
              <TableHead className="text-right" title="Impact — how unhappy they were, 1 to 5">Severity</TableHead>
              <TableHead className="text-right" title="Confidence — how many sources it came from">Sources</TableHead>
              <TableHead>Effort</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Your score</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Evidence</TableHead>
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
                      onChange={(v) =>
                        setEffortMutation.mutate({
                          theme_id: t.theme_id,
                          effort: v,
                          feature_group_id: t.feature_group_id,
                        })
                      }
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
                    <MoscowBadge value={t.moscow} />
                  </TableCell>
                  <TableCell>
                    <ReadinessBadge value={t.readiness} />
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
