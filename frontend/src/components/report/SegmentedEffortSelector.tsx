import { cn } from '@/lib/utils';

/**
 * How much work this is, in the units engineers actually use.
 *
 * These were XS / S / M / L / XL, which reads as a size chart rather than an
 * estimate — and t-shirt sizing means nothing without a team's private
 * convention for what "M" is worth. Time is the one unit everybody already
 * shares, and it matches how the digest states effort elsewhere ("about a day",
 * "one sprint"), so the two cannot drift into different vocabularies.
 *
 * The value stays the divisor the pipeline expects; only the label changed.
 */
export const EFFORT_OPTIONS: Array<{ label: string; value: number; hint: string }> = [
  { label: 'Hours', value: 0.25, hint: 'An afternoon' },
  { label: 'A day', value: 0.5, hint: 'A day or two' },
  { label: 'A week', value: 1.0, hint: 'About a week' },
  { label: 'A sprint', value: 2.0, hint: 'Two weeks' },
  { label: 'Longer', value: 4.0, hint: 'A month or more' },
];

interface Props {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function closestOption(value: number): number {
  return EFFORT_OPTIONS.reduce((best, o) =>
    Math.abs(o.value - value) < Math.abs(best - value) ? o.value : best,
    EFFORT_OPTIONS[0].value,
  );
}

export function SegmentedEffortSelector({ value, onChange, disabled }: Props) {
  const active = closestOption(value);
  return (
    <div role="radiogroup" className="inline-flex items-stretch rounded-md border bg-background overflow-hidden">
      {EFFORT_OPTIONS.map((opt) => {
        const isActive = opt.value === active;
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            className={cn(
              'min-w-[34px] px-2 py-1 text-xs font-medium tabular-nums transition-colors',
              'border-r last:border-r-0',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            title={opt.hint}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
