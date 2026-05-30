import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { groupColor, MOSCOW_CLASS, TREND_ARROW, TREND_CLASS, severityTier } from '@/lib/colors';
import { featureGroupName } from '@/lib/parsers';
import { useScopedLinkBuilder } from '@/lib/url-state';
import type { ParsedDigest } from '@/lib/parsers';
import type { MoSCoW } from '@/types';

interface Props {
  digest: ParsedDigest;
}

function signalDeltaCell(delta: number | null): React.ReactNode {
  if (delta === null || delta === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (delta === 0) return <span className="text-xs text-muted-foreground">0</span>;
  const isUp = delta > 0;
  return (
    <span className={cn('text-xs font-medium tabular-nums', isUp ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
      {isUp ? '+' : ''}
      {delta}
    </span>
  );
}

export function RankingTable({ digest }: Props) {
  const buildLink = useScopedLinkBuilder();

  const rows = [...digest.riceScores].sort((a, b) => b.score - a.score);
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Feature Group Ranking</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No RICE scores in this digest.</p>
        </CardContent>
      </Card>
    );
  }

  const moscowById = new Map(digest.moscow.map((m) => [m.id, m.moscow]));
  const wowById = new Map(digest.wow.map((w) => [w.id, w]));
  const trendById = new Map(digest.trends.map((t) => [t.id, t.trend]));
  // Compute per-group signal count from theme breakdown
  const signalCountByGroup = new Map<string, number>();
  for (const t of digest.themeBreakdown) {
    signalCountByGroup.set(t.feature_group_id, (signalCountByGroup.get(t.feature_group_id) ?? 0) + t.signal_count);
  }
  // Compute per-group avg severity from theme breakdown (signal-weighted)
  const severityByGroup = new Map<string, number>();
  for (const t of digest.themeBreakdown) {
    const existing = severityByGroup.get(t.feature_group_id);
    severityByGroup.set(t.feature_group_id, existing === undefined ? t.impact : (existing + t.impact) / 2);
  }
  // Find top theme label per group
  const topThemeByGroup = new Map<string, string>();
  for (const t of digest.themeBreakdown) {
    const existing = topThemeByGroup.get(t.feature_group_id);
    if (!existing) topThemeByGroup.set(t.feature_group_id, t.theme_label);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature Group Ranking</CardTitle>
        <CardDescription>Ordered by top theme's RICE score. Click a row to drill into that group.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px] pl-6">#</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="hidden lg:table-cell">Top Theme</TableHead>
              <TableHead className="text-right">Signals</TableHead>
              <TableHead className="text-right">Δ</TableHead>
              <TableHead className="text-right">Severity</TableHead>
              <TableHead>MoSCoW</TableHead>
              <TableHead className="text-right">RICE</TableHead>
              <TableHead>Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => {
              const moscow = moscowById.get(r.id) as MoSCoW | undefined;
              const wow = wowById.get(r.id);
              const signals = signalCountByGroup.get(r.id) ?? 0;
              const sev = severityByGroup.get(r.id) ?? 0;
              const trend = trendById.get(r.id);
              const color = groupColor(r.id).hex;

              return (
                <TableRow key={r.id} className="hover:bg-muted/40">
                  <TableCell className="text-muted-foreground font-mono text-xs pl-6">{idx + 1}</TableCell>
                  <TableCell>
                    <Link to={buildLink('/digest', { group: r.id })} className="inline-flex items-center gap-2 font-medium hover:underline">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                      {featureGroupName(r.id)}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[280px] truncate">
                    {topThemeByGroup.get(r.id) || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{signals}</TableCell>
                  <TableCell className="text-right">{signalDeltaCell(wow?.signal_delta ?? null)}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', severityTier(sev).className.split(' ').filter((c) => c.startsWith('text-')).join(' '))}>
                    {sev.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    {moscow ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', MOSCOW_CLASS[moscow])}>
                          {moscow}
                        </Badge>
                        {wow?.moscow_escalated && wow.moscow_prev && (
                          <span className="text-[10px] text-orange-600 dark:text-orange-400">
                            ↑ was {wow.moscow_prev}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.score.toFixed(1)}</TableCell>
                  <TableCell>
                    {trend ? (
                      <span className={cn('text-xs font-medium', TREND_CLASS[trend] ?? '')}>
                        {TREND_ARROW[trend] ?? '·'} {trend}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
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
