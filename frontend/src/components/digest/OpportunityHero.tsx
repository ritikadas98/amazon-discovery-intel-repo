import { Link } from 'react-router-dom';
import { ArrowRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { groupColor, severityTier } from '@/lib/colors';
import { featureGroupName, formatWeekLabel } from '@/lib/parsers';
import { useScopedLinkBuilder } from '@/lib/url-state';
import { ConsequenceBadge } from '@/components/common/StatusBadges';
import { SCORES_NOT_COMPARABLE } from '@/lib/vocabulary';
import type { Consequence, Readiness, WoWDeltaEntry } from '@/types';

export interface OpportunityHeroData {
  groupId: string;
  topTheme: string;
  summary: string;
  severity: number;
  trend: 'worsening' | 'stable' | 'improving' | null;
  weekId: string;
  delta: WoWDeltaEntry | null;
  /** Most costly consequence in this group's top theme, if the run recorded one. */
  consequence?: Consequence;
  consequenceCount?: number;
  signalCount?: number;
  /** First recommended next step, so the card ends on something to do. */
  nextStep?: string | null;
  /** Whether the top theme has enough behind it to act on. */
  readiness?: Readiness | null;
}

interface Props {
  data: OpportunityHeroData;
}

function trendIcon(trend: string | null) {
  if (trend === 'worsening') return <TrendingUp className="h-3.5 w-3.5" />;
  if (trend === 'improving') return <TrendingDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function trendClass(trend: string | null): string {
  if (trend === 'worsening') return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400';
  if (trend === 'improving') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400';
}

function renderSignalDelta(delta: WoWDeltaEntry | null): React.ReactNode {
  if (!delta || delta.signal_delta === null) {
    return <span className="text-muted-foreground">first run</span>;
  }
  if (delta.signal_delta === 0) return <span className="text-muted-foreground">no change</span>;
  const isUp = delta.signal_delta > 0;
  // The percentage is a score movement, and a score movement across a formula
  // change is the formula moving, not the problem. Complaint counts do not
  // depend on the formula, so those still compare either way.
  const pct = delta.scores_comparable === false ? null : delta.rice_delta_pct;
  return (
    <span className={isUp ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
      {isUp ? '+' : ''}
      {delta.signal_delta} complaints
      {typeof pct === 'number' && (
        <span className="ml-1 opacity-70">
          {isUp ? '↑' : '↓'}
          {Math.abs(pct)}%
        </span>
      )}{' '}
      vs last week
      {delta.scores_comparable === false && (
        <span className="ml-1.5 font-normal text-muted-foreground" title={SCORES_NOT_COMPARABLE}>
          · score not comparable
        </span>
      )}
    </span>
  );
}

export function OpportunityHero({ data }: Props) {
  const color = data.groupId === 'all' ? '#64748b' : groupColor(data.groupId).hex;
  const groupName = data.groupId === 'all' ? 'All Groups' : featureGroupName(data.groupId);
  const sev = severityTier(data.severity);
  const buildLink = useScopedLinkBuilder();

  // Ready means the evidence supports acting now, so the card says so in the
  // loudest way it has. Green would read as "resolved, nothing needed" — the
  // opposite of what this block is for. The triangle and the words carry the
  // same message, so the cue does not rest on colour alone.
  const actionable = data.readiness === 'READY';

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: color }} className="overflow-hidden">
      <CardContent className="py-4 px-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <span className="text-sm font-semibold" style={{ color }}>{groupName}</span>
          <span className="text-xs text-muted-foreground font-mono">{formatWeekLabel(data.weekId)}</span>
        </div>

        <h2 className="text-lg font-semibold leading-snug text-foreground mb-1">
          {data.topTheme || 'No top theme available'}
        </h2>

        {data.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">{data.summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-2.5 mt-4">
          <ConsequenceBadge
            value={data.consequence}
            count={data.consequenceCount}
            total={data.signalCount}
          />

          <Badge variant="outline" className={cn('font-medium', sev.className)}>
            How upset {data.severity.toFixed(1)}
          </Badge>

          {data.trend && (
            <Badge variant="outline" className={cn('font-medium gap-1', trendClass(data.trend))}>
              {trendIcon(data.trend)}
              {data.trend}
            </Badge>
          )}

          <span className="text-sm">{renderSignalDelta(data.delta)}</span>

          {data.groupId !== 'all' && (
            <Button asChild variant="ghost" size="sm" className="ml-auto -mr-2">
              <Link to={buildLink('/report')}>
                Discovery Report
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          )}
        </div>

        {data.nextStep && (
          <div
            className={cn(
              'mt-4 rounded-md border-l-4 px-4 py-3',
              actionable
                ? 'border-l-red-600 bg-red-50 dark:border-l-red-500 dark:bg-red-950/40'
                : 'border-l-slate-400 bg-muted/50 dark:border-l-slate-600',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.13em]',
                  actionable
                    ? 'bg-red-600 text-white dark:bg-red-400 dark:text-red-950'
                    : 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
                )}
              >
                {actionable && <span aria-hidden>▲</span>}
                {actionable ? 'Do this first' : 'Before you can act'}
              </span>
            </div>
            <p className="mt-2 text-[15px] font-semibold leading-snug">{data.nextStep}</p>
            {!actionable && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Not enough behind this yet. This is the step that would change that.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
