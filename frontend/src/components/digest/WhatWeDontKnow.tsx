/**
 * The third claim on the card: what the evidence cannot settle.
 *
 * The data already existed — `gap_reasons` from Agent 5 — but it lived in a
 * collapsed strip and on the report page, which meant the two confident panels
 * appeared side by side with nothing next to them. A card that shows what it
 * counted and what it concluded, and stays quiet about what it cannot see,
 * reads more certain than the evidence is.
 *
 * `?` rather than a warning triangle on purpose. These are open questions, not
 * failures; the theme may still be the right thing to work on.
 */
export function WhatWeDontKnow({
  gaps,
  nextSteps,
}: {
  gaps?: string[];
  nextSteps?: string[];
}) {
  const items = (gaps ?? []).filter(Boolean);
  if (items.length === 0) return null;

  // The first next step is what would settle the gap, so it belongs here rather
  // than repeated as its own block. Shown only when there is a gap to settle.
  const settle = (nextSteps ?? []).filter(Boolean)[0];

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl border bg-card p-4">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-slate-400 dark:bg-slate-500" aria-hidden />
      {/* The artifact washed each panel with its own colour, fading out under
          the rule. Without it three panels read as identical grey cards with a
          stripe, and the colour stops working below the header. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-[3px] h-24 bg-gradient-to-b from-slate-500/[0.12] dark:from-slate-400/[0.09] to-transparent"
        aria-hidden
      />
      <div className="relative mb-2.5 flex items-center gap-2">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-slate-500 text-[11px] font-bold text-white dark:bg-slate-400 dark:text-slate-900"
          title="Questions the reviews cannot answer. Each one needs a different source."
        >
          ?
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.115em] text-muted-foreground">
          What we still don&rsquo;t know
        </span>
      </div>

      <ul className="relative list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-muted-foreground marker:text-slate-400">
        {items.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ul>

      {settle && (
        <p className="mt-3 border-t pt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Would settle it:</span> {settle}
        </p>
      )}
    </div>
  );
}
