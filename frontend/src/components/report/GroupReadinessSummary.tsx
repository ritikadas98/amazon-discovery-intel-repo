import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { groupColor, GROUP_READINESS_CLASS, GROUP_READINESS_LABEL } from '@/lib/colors';
import { featureGroupName, formatWeekLabel } from '@/lib/parsers';
import type { Readiness } from '@/types';

interface Props {
  groupId: string;
  weekId: string;
  overallReadiness: Readiness | null;
  summary?: string;
  themesReady: number;
  themesTotal: number;
  themesNeedsEvidence: number;
}

function readinessIcon(label: 'READY' | 'PARTIAL' | 'NOT_READY') {
  if (label === 'READY') return <CheckCircle2 className="h-4 w-4" />;
  if (label === 'PARTIAL') return <AlertCircle className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

export function GroupReadinessSummary({
  groupId,
  weekId,
  overallReadiness,
  summary,
  themesReady,
  themesTotal,
  themesNeedsEvidence,
}: Props) {
  const groupName = featureGroupName(groupId);
  const color = groupColor(groupId).hex;
  const label = overallReadiness ? GROUP_READINESS_LABEL[overallReadiness] : 'NOT_READY';

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <CardContent className="py-4 px-5">
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <h2 className="text-lg font-semibold">{groupName} — Discovery Readiness Report</h2>
          <span className="text-xs text-muted-foreground font-mono">{formatWeekLabel(weekId)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-sm text-muted-foreground">Overall Readiness</span>
          <Badge variant="outline" className={cn('font-semibold gap-1', GROUP_READINESS_CLASS[label])}>
            {readinessIcon(label)}
            {label.replace(/_/g, ' ')}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">{themesReady}</strong> of <strong className="text-foreground">{themesTotal}</strong>{' '}
          theme{themesTotal === 1 ? '' : 's'} {themesTotal === 1 ? 'is' : 'are'} ready for solution scoping.
          {themesNeedsEvidence > 0 && (
            <>
              {' '}
              <strong className="text-foreground">{themesNeedsEvidence}</strong> theme{themesNeedsEvidence === 1 ? '' : 's'} need
              {themesNeedsEvidence === 1 ? 's' : ''} more evidence.
            </>
          )}
        </p>
        {summary && <p className="text-sm text-foreground mt-2">{summary}</p>}
      </CardContent>
    </Card>
  );
}
