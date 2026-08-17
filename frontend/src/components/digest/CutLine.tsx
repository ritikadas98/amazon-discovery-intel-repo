/**
 * The line under the last problem worth reading.
 *
 * A ranked list of twelve invites a reader to work down it. But once nothing
 * below a certain point clears the evidence bar *and* nothing below it scores
 * higher, the rest is a record rather than a queue. Saying so explicitly is
 * kinder than letting someone scroll to the bottom to discover it themselves.
 *
 * Deliberately a dashed rule rather than another card: it is a boundary, not an
 * item, and it should not read as one more thing to read.
 */
export function CutLine({ remaining, below }: { remaining: number; below: number | null }) {
  if (remaining <= 0) return null;

  return (
    <div className="my-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-dashed border-muted-foreground/60 pt-3">
      <span className="text-[12.5px] font-medium">
        Everything below here is both smaller and less certain
        {below !== null && (
          <span className="font-normal text-muted-foreground">
            {' '}
            — nothing scores above {below.toFixed(1)}
          </span>
        )}
      </span>
      <span className="text-[10.5px] font-medium uppercase tracking-[0.115em] text-muted-foreground">
        {remaining} {remaining === 1 ? 'problem' : 'problems'} · worth recording, not reading
      </span>
    </div>
  );
}
