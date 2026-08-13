import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TREND_LABEL } from '@/lib/vocabulary';
import type { ThemeBreakdownEntry } from '@/types';

/**
 * The whole reason this component exists.
 *
 * The card used to print `R 26 · I 3.4 · C 0.8 · E 1` beside a score of 85.6. Those
 * four numbers multiply to 70.7, because two factors — version and trend — were applied
 * by the pipeline and never shown. Anyone who checked the arithmetic concluded the score
 * was decorative, on a project whose entire claim is that every number is checkable.
 *
 * So: every factor, in the order they multiply, ending in the number printed on the card.
 * The pipeline now rounds each component before scoring from it, so this identity is
 * exact rather than approximate — see src/pipeline/rice.ts.
 */

interface Props {
  theme: ThemeBreakdownEntry;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
}

export function ThemeScoreDerivation({ theme: t }: Props) {
  const [open, setOpen] = useState(false);

  const steps = [
    { label: 'people', value: fmt(t.reach), op: '' },
    { label: 'severity', value: fmt(t.impact), op: '×' },
    { label: 'confidence', value: fmt(t.confidence), op: '×' },
    { label: 'version', value: fmt(t.version_multiplier), op: '×' },
    { label: 'effort', value: fmt(t.effort), op: '÷' },
    { label: TREND_LABEL[t.trend_direction], value: fmt(t.trend_multiplier), op: '×' },
  ];

  return (
    <div className="mt-2 pt-2 border-t">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? 'Hide the scoring' : 'Show the scoring'}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] tabular-nums">
            {steps.map((s) => (
              <span key={s.label} className="inline-flex items-baseline gap-1">
                {s.op && <span className="text-muted-foreground/60">{s.op}</span>}
                <span className="font-mono font-medium">{s.value}</span>
                <span className="text-muted-foreground">{s.label}</span>
              </span>
            ))}
            <span className="text-muted-foreground/60">=</span>
            <span className="font-mono font-semibold">{t.system_rice.toFixed(1)}</span>
          </div>
          <p className={cn('text-[10.5px] text-muted-foreground leading-relaxed')}>
            Multiply it through yourself &mdash; it lands on {t.system_rice.toFixed(1)}. Every figure
            here comes from the reviews behind this theme.
          </p>
        </div>
      )}
    </div>
  );
}
