import { FlaskConical, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveSource, useSetParam } from '@/lib/url-state';

const SOURCES = [
  { value: 'sample' as const, label: 'Sample data', icon: FlaskConical },
  { value: 'live' as const, label: 'Live data', icon: Radio },
];

/** First-class toggle so a viewer can see whether they're looking at the
 *  curated Sample dataset or real Live ingestion. Filters the whole dashboard. */
export function SourceToggle() {
  const active = useActiveSource();
  const setParam = useSetParam();
  return (
    <div
      role="group"
      aria-label="Data source"
      className="inline-flex items-center rounded-md border bg-secondary/40 p-0.5"
    >
      {SOURCES.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.value;
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => setParam('source', s.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3 w-3" />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
