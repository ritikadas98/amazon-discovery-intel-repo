import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { groupColor, TREND_ARROW, TREND_CLASS, severityTier } from '@/lib/colors';
import { ConsequenceBadge, MoscowBadge, ScoreBandBadge } from '@/components/common/StatusBadges';
import { CutLine } from './CutLine';
import { TREND_LABEL } from '@/lib/vocabulary';
import { featureGroupName } from '@/lib/parsers';
import { useScopedLinkBuilder } from '@/lib/url-state';
import type { ParsedDigest } from '@/lib/parsers';
import type { Consequence, MoSCoW, TrendDirection } from '@/types';

interface Props {
  digest: ParsedDigest;
}

/**
 * The change against last week, shown beside the count it belongs to.
 *
 * This used to be its own column headed "Δ" — a symbol with no legend, next to five
 * other unexplained numbers. Attached to the signal count it needs no explaining.
 */
function signalDeltaCell(delta: number | null): React.ReactNode {
  if (delta === null || delta === undefined || delta === 0) return null;
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
          <CardTitle>Where the complaints are</CardTitle>
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

  // A group takes the most costly consequence any of its themes carries. Same
  // worst-case rule as the theme roll-up: averaging would bury the one theme
  // where money moved.
  const RANK: Consequence[] = ['money', 'lost', 'blocked', 'annoyance'];
  const consequenceByGroup = new Map<string, { consequence: Consequence; count: number; total: number }>();
  for (const t of digest.themeBreakdown) {
    if (!t.consequence) continue;
    const cur = consequenceByGroup.get(t.feature_group_id);
    const better = !cur || RANK.indexOf(t.consequence) < RANK.indexOf(cur.consequence);
    if (better) {
      consequenceByGroup.set(t.feature_group_id, {
        consequence: t.consequence,
        count: t.consequence_count ?? 0,
        total: t.signal_count,
      });
    }
  }

  // Bands are relative to the biggest thing in this run, so the table needs to
  // know its own top before it can describe any row.
  const topScore = rows[0]?.score ?? 0;

  // Where the list stops being a queue and becomes a record: after the last
  // group whose top theme can carry a decision. Everything below is both lower
  // scoring and unactionable, so the reader is told rather than left to scroll.
  const readyGroups = new Set(
    digest.themeBreakdown.filter((t) => t.readiness === 'READY').map((t) => t.feature_group_id),
  );
  const lastActionable = rows.reduce((last, r, i) => (readyGroups.has(r.id) ? i : last), -1);
  const cutAfter = lastActionable >= 0 && lastActionable < rows.length - 1 ? lastActionable : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the complaints are</CardTitle>
        <CardDescription>Highest priority first. Click a row to open that group.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              {/* Named for someone who has never seen this dashboard. "Severity"
                  and "Score" told a reader nothing about what they measure —
                  and worse, implied the two agree. They routinely do not. */}
              <TableHead className="w-[40px] pl-6">#</TableHead>
              <TableHead>Part of the app</TableHead>
              <TableHead className="hidden lg:table-cell">Biggest problem</TableHead>
              <TableHead className="text-right">Complaints</TableHead>
              <TableHead className="text-right">How upset</TableHead>
              <TableHead>What it cost</TableHead>
              <TableHead>How big</TableHead>
              <TableHead>Priority</TableHead>
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
                <Fragment key={r.id}>
                <TableRow className="hover:bg-muted/40">
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
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {signals}
                    {signalDeltaCell(wow?.signal_delta ?? null)}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', severityTier(sev).className.split(' ').filter((c) => c.startsWith('text-')).join(' '))}>
                    {sev.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <ConsequenceBadge
                      value={consequenceByGroup.get(r.id)?.consequence}
                      count={consequenceByGroup.get(r.id)?.count}
                      total={consequenceByGroup.get(r.id)?.total}
                    />
                  </TableCell>
                  <TableCell>
                    <ScoreBandBadge score={r.score} topScore={topScore} />
                  </TableCell>
                  <TableCell>
                    {moscow ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MoscowBadge value={moscow} />
                        {wow?.moscow_escalated && wow.moscow_prev && (
                          <span className="text-[10px] text-orange-600 dark:text-orange-400">
                            ↑ was {wow.moscow_prev}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                    {trend && (
                      <span className={cn('ml-2 text-[11px] font-medium', TREND_CLASS[trend] ?? '')}>
                        {TREND_ARROW[trend] ?? '·'} {TREND_LABEL[trend as TrendDirection] ?? trend}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {cutAfter === idx && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="px-6 py-0">
                      <CutLine
                        remaining={rows.length - idx - 1}
                        below={rows[idx + 1]?.score ?? null}
                      />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
