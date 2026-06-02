import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Star, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { groupColor, severityTier } from '@/lib/colors';
import { featureGroupName, rowSource, toNumber } from '@/lib/parsers';
import { useActiveGroup, useActiveSource, useActiveWeek } from '@/lib/url-state';
import { api } from '@/lib/api';

const PAGE_SIZE = 20;

const SOURCE_LABEL: Record<string, string> = {
  app_store: 'App Store',
  play_store: 'Play Store',
  amazon_review: 'Amazon Review',
};

type SeverityBucket = 'all' | 'critical' | 'major' | 'minor';
type SortKey = 'severity-desc' | 'date-desc' | 'rating-asc';

function bucketCheck(score: number, bucket: SeverityBucket): boolean {
  if (bucket === 'all') return true;
  if (bucket === 'critical') return score >= 4;
  if (bucket === 'major') return score >= 3 && score < 4;
  if (bucket === 'minor') return score < 3;
  return true;
}

function ratingStars(rating: number): React.ReactNode {
  if (!rating || rating < 1) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="inline-flex items-center text-amber-500">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn('h-3 w-3', i < rating ? 'fill-current' : 'fill-none opacity-30')} />
      ))}
    </span>
  );
}

export function SignalsPage() {
  const group = useActiveGroup();
  const weekParam = useActiveWeek();
  const activeSource = useActiveSource();

  // We need a week to fetch signals. If absent, fetch latest digest to discover the latest week.
  const digestsQuery = useQuery({
    queryKey: ['digests', 1],
    queryFn: () => api.digests(1),
    enabled: !weekParam,
  });
  const weekId = weekParam ?? digestsQuery.data?.rows[0]?.['Week ID'] ?? null;

  const signalsQuery = useQuery({
    queryKey: ['signals', group, weekId],
    queryFn: () =>
      group === 'all' ? api.signalsForWeek(weekId!) : api.signalsForGroup(weekId!, group),
    enabled: !!weekId,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [severityBucket, setSeverityBucket] = useState<SeverityBucket>('all');
  const [sortKey, setSortKey] = useState<SortKey>('severity-desc');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Reset paging when filters change
  useEffect(() => {
    setPage(1);
    setExpanded(new Set());
  }, [group, weekId, search, sourceFilter, severityBucket, sortKey, activeSource]);

  // Scope to the active data source (Sample vs Live) — distinct from the
  // signal-channel `sourceFilter` (app_store/play_store/amazon_review).
  const rows = (signalsQuery.data?.rows ?? []).filter(
    (r) => rowSource(r['Data Source']) === activeSource,
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let arr = rows.filter((r) => {
      if (sourceFilter !== 'all' && r.Source !== sourceFilter) return false;
      const sev = toNumber(r['Severity Score']);
      if (!bucketCheck(sev, severityBucket)) return false;
      if (needle && !r.Text.toLowerCase().includes(needle)) return false;
      return true;
    });
    arr = [...arr];
    if (sortKey === 'severity-desc') {
      arr.sort((a, b) => toNumber(b['Severity Score']) - toNumber(a['Severity Score']));
    } else if (sortKey === 'date-desc') {
      arr.sort((a, b) => (b.Date ?? '').localeCompare(a.Date ?? ''));
    } else if (sortKey === 'rating-asc') {
      arr.sort((a, b) => toNumber(a.Rating, 99) - toNumber(b.Rating, 99));
    }
    return arr;
  }, [rows, search, sourceFilter, severityBucket, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search signal text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[280px]"
        />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="app_store">App Store</SelectItem>
            <SelectItem value="play_store">Play Store</SelectItem>
            <SelectItem value="amazon_review">Amazon Review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityBucket} onValueChange={(v) => setSeverityBucket(v as SeverityBucket)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical (4–5)</SelectItem>
            <SelectItem value="major">Major (3–4)</SelectItem>
            <SelectItem value="minor">Minor (1–3)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="severity-desc">Severity ↓</SelectItem>
            <SelectItem value="date-desc">Date ↓</SelectItem>
            <SelectItem value="rating-asc">Rating ↑</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {signalsQuery.isLoading && (
        <Card>
          <CardContent className="py-3 space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {signalsQuery.isError && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-destructive">
              {signalsQuery.error instanceof Error ? signalsQuery.error.message : 'Failed to load signals.'}
            </p>
          </CardContent>
        </Card>
      )}

      {signalsQuery.data && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]" />
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="w-[110px]">Severity</TableHead>
                <TableHead>Text</TableHead>
                <TableHead className="w-[110px]">Source</TableHead>
                <TableHead className="w-[90px]">Date</TableHead>
                <TableHead className="w-[110px]">Rating</TableHead>
                <TableHead className="w-[160px]">Group · Theme</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    No signals match these filters.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((s, i) => {
                const id = s.ID || s.row_number;
                const isOpen = expanded.has(id);
                const sev = toNumber(s['Severity Score']);
                const sevTier = severityTier(sev);
                const versionFlagged = s['Version Flagged'] === 'TRUE';
                const gid = s['Feature Group ID'];
                const groupHex = groupColor(gid).hex;
                return (
                  <>
                    <TableRow key={id} onClick={() => toggleExpand(id)} className="cursor-pointer hover:bg-muted/40">
                      <TableCell>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{pageStart + i + 1}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('font-mono tabular-nums', sevTier.className)}>
                          {sev.toFixed(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="line-clamp-2" title={s.Text}>{s.Text.length > 120 ? s.Text.slice(0, 120) + '…' : s.Text}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{SOURCE_LABEL[s.Source] ?? s.Source}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{s.Date}</TableCell>
                      <TableCell>{ratingStars(toNumber(s.Rating))}</TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: groupHex }} aria-hidden />
                          <span className="truncate">{featureGroupName(gid)}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {versionFlagged && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-label="Version flagged" />
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${id}-expand`}>
                        <TableCell />
                        <TableCell colSpan={8} className="bg-muted/30">
                          <div className="py-2 space-y-2">
                            <p className="text-sm leading-relaxed">{s.Text}</p>
                            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                              <div><dt className="text-muted-foreground">Theme</dt><dd>{s['Theme Label']}</dd></div>
                              <div><dt className="text-muted-foreground">Theme ID</dt><dd className="font-mono">{s['Theme ID']}</dd></div>
                              <div><dt className="text-muted-foreground">Week</dt><dd className="font-mono">{s['Week ID']}</dd></div>
                              <div><dt className="text-muted-foreground">App version</dt><dd className="font-mono">{s['App Version'] || '—'}</dd></div>
                              <div><dt className="text-muted-foreground">ID</dt><dd className="font-mono">{s.ID}</dd></div>
                              <div><dt className="text-muted-foreground">Created</dt><dd className="font-mono">{s['Created At']?.slice(0, 19)}</dd></div>
                            </dl>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
