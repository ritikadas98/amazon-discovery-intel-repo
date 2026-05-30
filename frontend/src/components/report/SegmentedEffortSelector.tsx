import { cn } from '@/lib/utils';

export const EFFORT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: 'XS', value: 0.25 },
  { label: 'S', value: 0.5 },
  { label: 'M', value: 1.0 },
  { label: 'L', value: 2.0 },
  { label: 'XL', value: 4.0 },
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
            title={`${opt.label} · effort ${opt.value}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
