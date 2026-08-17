import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { SourceBadge } from './SourceBadge';
import { ScoringGlossary } from '@/components/common/ScoringGlossary';

/**
 * One line telling a stranger what they are looking at, and one place for the caveats.
 *
 * A visitor used to meet three stacked banners before a single finding: the provenance
 * chip, a data-quality warning, and the readiness-gaps panel. Three warnings, then the
 * work. The honesty is worth keeping — it is a large part of what this project is
 * demonstrating — but it should not be the first thing anyone reads.
 */

interface Props {
  /** @deprecated shown by DigestHeadline now; kept so callers need no change. */
  signalCount?: number;
  groupCount?: number;
  source: 'Sample' | 'Live';
  pulledAt?: string;
  dataQualityWarning?: string | null;
}

export function DigestIntro({ source, pulledAt, dataQualityWarning }: Props) {
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <div className="space-y-2">
      {/* The count moved into DigestHeadline, which leads with the finding and
          carries the figures underneath it. Printing it twice made the page open
          with the same sentence in two registers. What stays here is the pair of
          disclosures — how it was scored, and where the data came from. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ScoringGlossary />
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          aria-expanded={notesOpen}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {notesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Where this data came from
          {dataQualityWarning && <AlertTriangle className="h-3 w-3 text-amber-500" />}
        </button>
      </div>

      {notesOpen && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <SourceBadge source={source} pulledAt={pulledAt} />
          {dataQualityWarning && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {dataQualityWarning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
