// Shared minimum-substance bar for live review sources. Drops short / low-detail
// reviews ("good app", "fix it", emoji-only, generic praise) that carry no
// actionable signal. Language-agnostic: a char floor + a whitespace word-count
// floor, so non-English (Hindi/regional) reviews still pass and the clean agent
// handles language/relevance downstream.
const MIN_CHARS = 25;
const MIN_WORDS = 5;

export function hasSubstance(text: string): boolean {
  const t = (text ?? '').trim();
  if (t.length < MIN_CHARS) return false;
  return t.split(/\s+/).filter(Boolean).length >= MIN_WORDS;
}
