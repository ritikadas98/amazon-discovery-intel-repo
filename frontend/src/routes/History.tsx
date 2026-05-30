import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, AlertCircle, XCircle, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { featureGroupName, parseDigestRow } from '@/lib/parsers';
import type { MoSCoW, Readiness } from '@/types';

const MOSCOW_PILL: Record<MoSCoW, string> = {
  'Must Have': 'bg-destructive/10 text-destructive border-destructive/30',
  'Should Have': 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
  'Could Have': 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  "Won't Have": 'bg-muted text-muted-foreground border-border',
};

const READINESS_ICON: Record<Readiness, LucideIcon> = {
  READY: CheckCircle2,
  NEEDS_MORE_EVIDENCE: AlertCircle,
  BLOCKED: XCircle,
};

const READINESS_COLOR: Record<Readiness, string> = {
  READY: 'text-emerald-600 dark:text-emerald-400',
  NEEDS_MORE_EVIDENCE: 'text-amber-600 dark:text-amber-400',
  BLOCKED: 'text-destructive',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function History() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['digests', 20],
    queryFn: () => api.digests(20),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Past weekly pipeline runs. Most recent first.
        </p>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="py-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load history.'}
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No pipeline runs yet. Click "Run pipeline" to create the first one.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.rows.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Top group</TableHead>
                <TableHead className="text-right">RICE</TableHead>
                <TableHead>MoSCoW</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead className="text-right">Signals</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const d = parseDigestRow(row);
                const ReadinessIcon = d.overallReadiness ? READINESS_ICON[d.overallReadiness] : null;
                return (
                  <TableRow key={d.rowNumber || d.weekId}>
                    <TableCell className="font-mono text-xs">{d.weekId}</TableCell>
                    <TableCell className="font-medium">{featureGroupName(d.topGroupId)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{d.topRiceScore.toFixed(1)}</TableCell>
                    <TableCell>
                      {d.topMoscow ? (
                        <Badge variant="outline" className={cn('text-[10px] py-0 px-1.5 h-5', MOSCOW_PILL[d.topMoscow])}>
                          {d.topMoscow}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {d.overallReadiness && ReadinessIcon ? (
                        <span className={cn('inline-flex items-center gap-1 text-xs', READINESS_COLOR[d.overallReadiness])}>
                          <ReadinessIcon className="h-3 w-3" />
                          {d.overallReadiness.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.signalCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(d.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/week/${d.weekId}`}>
                          View <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
