import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { featureGroupName } from '@/lib/parsers';
import type { ParsedDigest } from '@/lib/parsers';
import type { MoSCoW, Readiness } from '@/types';

const MOSCOW_STYLE: Record<MoSCoW, string> = {
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

const READINESS_STYLE: Record<Readiness, string> = {
  READY: 'text-emerald-600 dark:text-emerald-400',
  NEEDS_MORE_EVIDENCE: 'text-amber-600 dark:text-amber-400',
  BLOCKED: 'text-destructive',
};

interface Props {
  digest: ParsedDigest;
}

function KpiCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-base font-semibold leading-tight">{children}</div>
      </CardContent>
    </Card>
  );
}

export function KPIStrip({ digest }: Props) {
  const ReadinessIcon = digest.overallReadiness ? READINESS_ICON[digest.overallReadiness] : null;
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard label="Top group">
        <div className="truncate">{featureGroupName(digest.topGroupId)}</div>
      </KpiCard>

      <KpiCard label="Top RICE">
        <div className="font-mono">{digest.topRiceScore.toFixed(1)}</div>
      </KpiCard>

      <KpiCard label="MoSCoW">
        {digest.topMoscow ? (
          <Badge variant="outline" className={cn('font-medium', MOSCOW_STYLE[digest.topMoscow])}>
            {digest.topMoscow}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </KpiCard>

      <KpiCard label="Readiness">
        {digest.overallReadiness && ReadinessIcon ? (
          <span className={cn('inline-flex items-center gap-1.5', READINESS_STYLE[digest.overallReadiness])}>
            <ReadinessIcon className="h-4 w-4" />
            {digest.overallReadiness.replace(/_/g, ' ')}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </KpiCard>

      <KpiCard label="Signals">
        <div>
          <span className="font-mono">{digest.signalCount}</span>
          <span className="text-xs text-muted-foreground ml-2">
            severity {digest.avgSeverity.toFixed(1)}
          </span>
        </div>
      </KpiCard>
    </div>
  );
}
