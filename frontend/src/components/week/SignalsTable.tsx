import { useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { featureGroupName, FEATURE_GROUP_NAMES, toNumber } from '@/lib/parsers';
import type { SignalRow } from '@/types';

const SOURCE_LABEL: Record<string, string> = {
  app_store: 'App Store',
  play_store: 'Play Store',
  amazon_review: 'Amazon Review',
};

const SOURCE_PILL: Record<string, string> = {
  app_store: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  play_store: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  amazon_review: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
};

function severityColor(score: number): string {
  if (score >= 4) return 'text-destructive';
  if (score >= 3) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

interface Props {
  rows: SignalRow[];
}

export function SignalsTable({ rows }: Props) {
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [minSeverity, setMinSeverity] = useState<string>('0');
  const [search, setSearch] = useState<string>('');

  const filtered = useMemo(() => {
    const min = toNumber(minSeverity);
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.Source !== sourceFilter) return false;
      if (groupFilter !== 'all' && r['Feature Group ID'] !== groupFilter) return false;
      const sev = toNumber(r['Severity Score']);
      if (sev < min) return false;
      if (needle && !r.Text.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, sourceFilter, groupFilter, minSeverity, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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

        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Feature group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All feature groups</SelectItem>
            {Object.entries(FEATURE_GROUP_NAMES).map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={minSeverity} onValueChange={setMinSeverity}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Min severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">All severities</SelectItem>
            <SelectItem value="2">≥ 2.0</SelectItem>
            <SelectItem value="3">≥ 3.0</SelectItem>
            <SelectItem value="4">≥ 4.0</SelectItem>
            <SelectItem value="4.5">≥ 4.5</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Search text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[280px]"
        />

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead className="w-[120px]">Source</TableHead>
              <TableHead className="w-[160px]">Group</TableHead>
              <TableHead className="w-[70px] text-right">Sev</TableHead>
              <TableHead>Text</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  No signals match these filters.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s) => {
              const sev = toNumber(s['Severity Score']);
              return (
                <TableRow key={s.ID || s.row_number}>
                  <TableCell className="text-xs text-muted-foreground font-mono">{s.Date}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] py-0 px-1.5 h-5', SOURCE_PILL[s.Source] ?? 'bg-muted')}
                    >
                      {SOURCE_LABEL[s.Source] ?? s.Source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{featureGroupName(s['Feature Group ID'])}</TableCell>
                  <TableCell className={cn('text-right font-mono tabular-nums', severityColor(sev))}>
                    {sev.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="line-clamp-2" title={s.Text}>
                      {s.Text}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
