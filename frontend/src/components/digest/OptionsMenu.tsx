import type { FirstMove, MoveOption } from '@/types';

/**
 * The second decision, held back until the evidence arrives.
 *
 * The action above this is a query. This is the menu you choose from once it
 * reports — and it exists so the card can answer "and then what" without
 * pretending the choice can be made today. The `IF` gate is the whole point:
 * everything here is conditional on a number nobody has yet.
 *
 * `covers` is what stops it being three equally good ideas. Options without a
 * coverage count are how a backlog fills with work that fixes the smallest
 * slice of a problem, and the leftover line is the same instinct applied to the
 * menu as a whole — a set of options that hides its own gaps is worse than none.
 */
export function OptionsMenu({
  options,
  leftover,
  totalComplaints,
  gatedOn,
}: {
  options?: MoveOption[];
  leftover?: string;
  totalComplaints: number;
  gatedOn?: FirstMove;
}) {
  if (!options || options.length === 0) return null;

  return (
    <div className="border-t bg-muted/60 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          If
        </span>
        <span className="text-[14.5px] font-semibold tracking-tight">
          {gatedOn ? gatedOn.action.replace(/\.$/, '') : 'the first move'} comes back positive
        </span>
      </div>

      <p className="mt-1.5 max-w-[78ch] text-[12.5px] leading-relaxed text-muted-foreground">
        {options.length === 1 ? 'One move' : `${options.length} moves`} to choose between — none of
        them is the action above. That one comes first. <strong className="font-semibold">Covers</strong>{' '}
        is how many of this problem&rsquo;s {totalComplaints} complaints each move fixes.
      </p>

      <div className="mt-2 space-y-2.5">
        {options.map((o, i) => (
          <div key={i} className="rounded-xl border bg-card px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
              <span className="text-[14px] font-semibold leading-snug">{o.title}</span>
              <span className="flex shrink-0 items-center gap-2.5">
                {o.covers > 0 ? (
                  <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                    <span>
                      covers <strong className="font-semibold text-foreground">{o.covers}</strong> of{' '}
                      {totalComplaints}
                    </span>
                    <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-foreground/10">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-foreground"
                        style={{ width: `${Math.round((o.covers / Math.max(totalComplaints, 1)) * 100)}%` }}
                      />
                    </span>
                  </span>
                ) : (
                  /* A move that fixes nothing on its own is still worth listing —
                     routing a theme to two teams unblocks the ones that do. */
                  <span className="text-[11.5px] text-muted-foreground">fixes nothing directly</span>
                )}
                <span className="rounded-full border bg-background px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {o.effort}
                </span>
              </span>
            </div>
            <p className="mt-1 max-w-[82ch] text-[12.5px] leading-relaxed text-muted-foreground">
              {o.tradeoff}
            </p>
          </div>
        ))}
      </div>

      {leftover && (
        <div className="mt-3 flex gap-2.5 rounded-xl border border-dashed border-amber-500 bg-card px-3.5 py-3 text-[12.5px] leading-relaxed">
          <span className="font-bold text-amber-600 dark:text-amber-400" aria-hidden>
            !
          </span>
          <span>{leftover}</span>
        </div>
      )}
    </div>
  );
}
