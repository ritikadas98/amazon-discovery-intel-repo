import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SCORE_CAVEAT, TREND_LABEL, scoreMeaning } from '@/lib/vocabulary';
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
  /** Highest score in this run, so the number can be described relative to something. */
  topScore: number;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
}

export function ThemeScoreDerivation({ theme: t, topScore }: Props) {
  const [open, setOpen] = useState(false);

  // Four factors, and all four are printed. Effort and trend are shown below as
  // stored-but-not-scored rather than dropped from the panel — a reader who knew
  // the old formula should be told where they went.
  const steps = [
    { label: 'people', value: fmt(t.reach), op: '' },
    { label: 'severity', value: fmt(t.impact), op: '×' },
    { label: 'confidence', value: fmt(t.confidence), op: '×' },
    { label: 'version', value: fmt(t.version_multiplier), op: '×' },
  ];

  return (
    <div className="mt-2.5 pt-2.5 border-t space-y-2">
      {/* What the number is for, always visible. The arithmetic is optional; knowing
          whether 34.6 means "do this now" or "ignore it" is not. */}
      <p className="text-[13px] leading-relaxed">{scoreMeaning(t.system_rice, topScore)}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {open ? 'Hide the scoring' : 'Show the scoring'}
      </button>

      {open && (
        <div className="space-y-1.5 rounded-md bg-muted/40 p-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] tabular-nums">
            {steps.map((s) => (
              <span key={s.label} className="inline-flex items-baseline gap-1">
                {s.op && <span className="text-muted-foreground/70">{s.op}</span>}
                <span className="font-mono font-semibold">{s.value}</span>
                <span className="text-muted-foreground">{s.label}</span>
              </span>
            ))}
            <span className="text-muted-foreground/70">=</span>
            <span className="font-mono font-semibold">{t.system_rice.toFixed(1)}</span>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Multiply it through &mdash; it lands on {t.system_rice.toFixed(1)} exactly. {SCORE_CAVEAT}
          </p>

          <p className="text-[12px] text-muted-foreground leading-relaxed border-t pt-2">
            <span className="font-medium text-foreground">Not in the sum:</span>{' '}
            effort <span className="font-mono">{fmt(t.effort)}</span> and{' '}
            {TREND_LABEL[t.trend_direction]}{' '}
            <span className="font-mono">{fmt(t.trend_multiplier)}</span>. Both are still worked out
            and stored. Effort belongs to the whole feature group, so it divided every theme in it
            by the same amount and could not change their order; the trend figure compares this
            week against last, and two runs can land in the same week. Set effort yourself in the
            report to see what it does.
          </p>
        </div>
      )}
    </div>
  );
}
