/**
 * Spreading one oversized value across several sheet cells.
 *
 * A Google Sheets cell holds 50,000 characters and that is a Google limit, not one
 * we can raise. "Theme Breakdown JSON" reached 49,108 on the 2026-08-18 run, with
 * 33 problems averaging 1,488 characters each. One more problem would have
 * overflowed it, and that column is what the whole dashboard reads.
 *
 * So the value is written across numbered columns and joined back on read. The
 * first column keeps its original name, which means rows written before this change
 * still read correctly with no migration.
 */

/** Well under the 50,000 hard limit, so a wide character never lands us on it. */
export const MAX_CELL_CHARS = 45000;

/** "X", "X 2", "X 3" ... — the first column keeps the name it always had. */
export function chunkColumns(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? base : `${base} ${i + 1}`));
}

/** How many columns of MAX_CELL_CHARS a string needs. Always at least one. */
export function chunksNeeded(text: string): number {
  return Math.max(1, Math.ceil(text.length / MAX_CELL_CHARS));
}

/**
 * Cut a string into cell-sized pieces.
 *
 * Splits on raw character count, not on any structure in the text. The pieces are
 * only ever meaningful once rejoined, which is why `joinChunks` is the only
 * supported way to read them.
 */
export function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CELL_CHARS) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CELL_CHARS) {
    out.push(text.slice(i, i + MAX_CELL_CHARS));
  }
  return out;
}

/**
 * Rejoin what `splitIntoChunks` wrote.
 *
 * Stops at the first missing or empty column, so a row written before the extra
 * columns existed returns exactly its single cell.
 */
export function joinChunks(row: Record<string, string | undefined>, base: string): string {
  let out = row[base] ?? '';
  for (let i = 2; ; i += 1) {
    const part = row[`${base} ${i}`];
    if (!part) return out;
    out += part;
  }
}
