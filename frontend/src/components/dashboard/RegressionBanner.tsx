import { AlertTriangle } from 'lucide-react';

interface Props {
  count: number;
  weekId: string;
}

export function RegressionBanner({ count, weekId }: Props) {
  if (count <= 0) return null;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">
          Version regression alert &mdash; {count} cluster{count === 1 ? '' : 's'} this run
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          The pipeline detected an app-version cluster of complaints in <span className="font-mono">{weekId}</span>.
          A separate regression email was sent at run time with the top signals.
        </p>
      </div>
    </div>
  );
}
