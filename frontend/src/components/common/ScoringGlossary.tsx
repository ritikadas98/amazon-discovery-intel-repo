import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MOSCOW_CAVEAT, READINESS_HINT, READINESS_LABEL, SCORING_GLOSSARY } from '@/lib/vocabulary';
import type { Readiness } from '@/types';

const READINESS_ORDER: Readiness[] = ['READY', 'NEEDS_MORE_EVIDENCE', 'BLOCKED'];

/**
 * Everything a first-time reader needs, one click away and nowhere else.
 *
 * The page previously assumed you already knew RICE, MoSCoW, severity and readiness,
 * and showed six unlabelled numbers per row on that assumption. Rather than strip the
 * frameworks out — they are part of what the project is demonstrating — the jargon
 * moves off the surface and lives here.
 */
export function ScoringGlossary() {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <HelpCircle className="h-3.5 w-3.5" />
        How this is scored
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] max-h-[70vh] overflow-y-auto text-xs space-y-3">
        <div className="space-y-1">
          <p className="font-medium text-sm">The priority score</p>
          <p className="text-muted-foreground leading-relaxed">
            Every theme gets one number. Six things go into it, and each theme card can show
            you its own arithmetic under &ldquo;Show the scoring&rdquo;.
          </p>
        </div>

        <dl className="space-y-1.5">
          {SCORING_GLOSSARY.map((g) => (
            <div key={g.term} className="grid grid-cols-[72px_1fr] gap-2">
              <dt className="font-medium">{g.term}</dt>
              <dd className="text-muted-foreground leading-relaxed">{g.plain}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-1 border-t pt-3">
          <p className="font-medium text-sm">Must / Should / Could / Won&rsquo;t</p>
          <p className="text-muted-foreground leading-relaxed">{MOSCOW_CAVEAT}</p>
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <p className="font-medium text-sm">Evidence labels</p>
          {READINESS_ORDER.map((r) => (
            <div key={r}>
              <p className="font-medium">{READINESS_LABEL[r]}</p>
              <p className="text-muted-foreground leading-relaxed">{READINESS_HINT[r]}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
