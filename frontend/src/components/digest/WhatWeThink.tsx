/**
 * The inferred half of the evidence, marked so it can never be mistaken for the
 * counted half.
 *
 * "What people reported" is arithmetic and a reader may treat it as fact. This
 * is an argument the system made on top of those facts, and arguments can be
 * wrong. The two panels sit side by side with different colours and different
 * glyphs precisely so a PM can see which is which before weighing either.
 *
 * ∴ is the logic symbol for "therefore" — the badge says "this is a deduction"
 * without a sentence, and the title attribute says it in words for anyone who
 * has not met the symbol.
 */
export function WhatWeThink({ mechanism }: { mechanism?: string[] }) {
  // Absent on every theme that was not READY, and on any diagnosis that failed
  // validation. Rendering nothing is correct: no inference was made.
  if (!mechanism || mechanism.length === 0) return null;

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border bg-card p-4">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-amber-600 dark:bg-amber-500" aria-hidden />
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-amber-600 text-[13px] font-bold leading-none text-white dark:bg-amber-500 dark:text-amber-950"
          title="“Therefore” — our reading of the evidence, not something a customer wrote."
        >
          ∴
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.115em] text-muted-foreground">
          What we think is going on
        </span>
      </div>

      <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground marker:text-amber-600/60 dark:marker:text-amber-500/60">
        {mechanism.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
