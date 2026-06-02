import { FlaskConical, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Provenance chip shown atop the Digest/Report pages so it's always clear
 *  whether the view is the curated Sample dataset or real Live ingestion. */
export function SourceBadge({ source, pulledAt }: { source: 'Sample' | 'Live'; pulledAt?: string }) {
  const isSample = source === 'Sample';
  const d = pulledAt ? new Date(pulledAt) : null;
  const dateStr =
    d && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        isSample
          ? 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      )}
    >
      {isSample ? <FlaskConical className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
      {isSample
        ? 'Sample data — a representative dataset, to show the analysis'
        : `Live data — real Play Store reviews${dateStr ? `, pulled ${dateStr}` : ''}`}
    </div>
  );
}
