import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { featureGroupName } from '@/lib/parsers';
import type { ParsedDigest } from '@/lib/parsers';
import type { Readiness } from '@/types';

const ICON: Record<Readiness, LucideIcon> = {
  READY: CheckCircle2,
  NEEDS_MORE_EVIDENCE: AlertCircle,
  BLOCKED: XCircle,
};

const COLOR: Record<Readiness, string> = {
  READY: 'text-emerald-600 dark:text-emerald-400',
  NEEDS_MORE_EVIDENCE: 'text-amber-600 dark:text-amber-400',
  BLOCKED: 'text-destructive',
};

const PILL: Record<Readiness, string> = {
  READY: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  NEEDS_MORE_EVIDENCE: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  BLOCKED: 'bg-destructive/10 text-destructive border-destructive/30',
};

interface Props {
  digest: ParsedDigest;
}

export function ReadinessSection({ digest }: Props) {
  if (!digest.readiness || !digest.overallReadiness) {
    return null;
  }

  const { readiness, overallReadiness } = digest;
  const Icon = ICON[overallReadiness];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Discovery Readiness</CardTitle>
            <CardDescription>
              {featureGroupName(digest.topGroupId)} — judged against 4 evidence criteria
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn('font-medium', PILL[overallReadiness])}>
            <Icon className={cn('h-3.5 w-3.5 mr-1.5', COLOR[overallReadiness])} />
            {overallReadiness.replace(/_/g, ' ')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground/90">{readiness.readiness_summary}</p>

        <div className="space-y-2">
          {readiness.themes.map((theme) => {
            const ThemeIcon = ICON[theme.readiness];
            return (
              <div
                key={theme.theme_id}
                className="rounded-md border bg-card px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium text-sm leading-tight">{theme.theme_label}</div>
                  <Badge variant="outline" className={cn('shrink-0 text-[10px] py-0 px-1.5 h-5', PILL[theme.readiness])}>
                    <ThemeIcon className={cn('h-3 w-3 mr-1', COLOR[theme.readiness])} />
                    {theme.readiness.replace(/_/g, ' ')}
                  </Badge>
                </div>
                {theme.gap_reasons.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    <span className="font-medium">Gaps:</span> {theme.gap_reasons.join(' · ')}
                  </p>
                )}
                {theme.recommended_next_steps.length > 0 && (
                  <p className="text-xs text-primary/80 mt-1">
                    <span className="font-medium">Next:</span> {theme.recommended_next_steps[0]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
