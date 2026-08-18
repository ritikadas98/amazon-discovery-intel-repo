import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoscowBadge, ReadinessBadge } from '@/components/common/StatusBadges';
import { api } from '@/lib/api';
import { SegmentedEffortSelector } from './SegmentedEffortSelector';
import type { EffortOverride, MoSCoW, ThemeBreakdownEntry } from '@/types';

interface Props {
  themes: ThemeBreakdownEntry[];
  weekId: string;
  overrides: EffortOverride[];
}

/**
 * The system score with the PM's effort divided into it.
 *
 * Must stay in step with `system_rice` in `src/pipeline/rice.ts`, or the two
 * columns differ when the PM has changed nothing and a reader can only conclude
 * one of them is wrong. It previously multiplied by `trend_multiplier`, which
 * the pipeline dropped at FORMULA_VERSION 2 — so effort stopped being the only
 * difference between the columns, which is the entire point of the control.
 *
 * Effort is deliberately absent from the system score: the pipeline has no
 * estimate of its own, and the PM supplying one here is the whole feature.
 */
/**
 * Priority, recomputed from the effort the PM just set.
 *
 * The two score columns are gone: a raw number has no unit and no scale, and
 * this page already says so. But removing them would leave the effort control
 * with nothing to show for itself, so the feedback moved to Priority instead —
 * change how much work something is, and watch it move up or down the list.
 *
 * Mirrors `percentileCuts` / `moscowFor` in `src/pipeline/rice.ts`. Cuts are
 * drawn across the themes on screen, exactly as the pipeline draws them across
 * a run, so something is always a Must Have even in a quiet group. That is a
 * property of forced ranking, not a bug, and the glossary says so.
 */
function priorityFor(score: number, allScores: number[]): MoSCoW {
  const sorted = [...allScores].sort((a, b) => a - b);
  const at = (pct: number) => sorted[Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1)] ?? 0;
  if (score >= at(75)) return 'Must Have';
  if (score >= at(50)) return 'Should Have';
  if (score >= at(25)) return 'Could Have';
  return "Won't Have";
}

function adjustedRice(t: ThemeBreakdownEntry, effort: number): number {
  if (effort <= 0) return 0;
  const raw = (t.reach * t.impact * t.confidence * t.version_multiplier) / effort;
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

  // Every row's current score, so the percentile cuts move when any one theme's
  // effort changes — priority is relative, and a change to one is a change to all.
  const adjustedScores = sorted.map((t) =>
    adjustedRice(t, overrideByThemeId.get(t.theme_id) ?? t.effort),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Themes in this group</CardTitle>
        {/* This description named the old formula, including the two factors
            that were removed. A page whose whole claim is that every number is
            checkable cannot describe an equation it no longer uses. */}
        <CardDescription>
          Score is complaints &times; how upset &times; spread across stores &times; app version.
          Work needed is <em>not</em> in it &mdash; the system has no estimate of its own, so set it
          yourself and your score appears beside it.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Problem</TableHead>
              {/* Named for what they measure, matching the digest. The framework
                  term stays in the tooltip for anyone who knows RICE. */}
              <TableHead className="text-right" title="Reach — how many people mentioned it">Complaints</TableHead>
              {/* The inputs to the score are desk work — and the effort selector
                  below is something you set with a mouse, not a thumb. A phone
                  gets the problem, its size, and the verdict. */}
              <TableHead className="hidden text-right md:table-cell" title="Impact — how upset they sounded, 1 to 5. Tone, not cost.">How upset</TableHead>
              <TableHead className="hidden text-right md:table-cell" title="Confidence — how many stores it came from">Where from</TableHead>
              <TableHead className="hidden md:table-cell">Work needed</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="hidden sm:table-cell">Can we act?</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
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
                  <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{t.impact.toFixed(1)}</TableCell>
                  <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{t.confidence.toFixed(1)}</TableCell>
                  <TableCell className="hidden md:table-cell">
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
                  <TableCell>
                    <MoscowBadge value={priorityFor(pmRice, adjustedScores)} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
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
