import { readRows } from '../lib/sheets.js';
import { getEnv } from '../config/env.js';
import type { RawSignal } from '../types.js';

/**
 * Amazon product reviews via Jina Reader (r.jina.ai). The /product-reviews/
 * page is behind a sign-in wall, but the /dp/<ASIN> product page renders its
 * "top reviews" section publicly, which Jina returns as markdown. We parse that
 * markdown — best-effort: review markup is messy and varies (US inline vs
 * international layout), so anything unparseable is skipped, and the whole
 * source fails soft (returns []).
 *
 * Watch list lives in the "Watch Listings" sheet tab: columns ASIN | Marketplace
 * (com/in/...). Reviews are deduped downstream by source_id.
 */

const JINA_BASE = 'https://r.jina.ai/';
const PER_ASIN_CAP = 15;
const FETCH_TIMEOUT_MS = 45_000;

export interface ParsedReview {
  reviewId?: string;
  rating: number | null;
  date: string; // YYYY-MM-DD or '' if unparseable
  title: string;
  body: string;
}

/** djb2 — stable short hash for reviews with no permalink (international). */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function toIsoDate(human: string): string {
  const d = new Date(human);
  if (Number.isNaN(d.getTime())) return '';
  // Use local date parts — toISOString() would shift to UTC and can land on the
  // previous day for positive-offset timezones.
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

/** Strip markdown links/images and Jina UI boilerplate, collapse whitespace. */
function cleanBody(raw: string): string {
  let t = raw;
  // Cut at the first end-of-review marker.
  t = t.split(/\[Read more Read less\]|\d+\s+(?:person|people)\s+found this helpful|\[Report\]|Helpful\s+Sending feedback/)[0];
  // Drop variant links ("[Style: …]", "[Colour: …]", "[Size: …]" etc.), the
  // "Verified Purchase" link, and the double-tap boilerplate.
  t = t
    .replace(/\[[A-Za-z][A-Za-z ]*:[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[Verified Purchase\]\([^)]*\)/g, '')
    .replace(/Brief content visible, double tap to read full content\.?/g, '')
    .replace(/Full content visible, double tap to read brief content\.?/g, '');
  // Remove images and unwrap links to their text.
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Collapse whitespace.
  return t.replace(/\s+/g, ' ').trim();
}

export function parseAmazonReviews(markdown: string): ParsedReview[] {
  const out: ParsedReview[] = [];
  const seenIds = new Set<string>();
  // Anchor each review on "<rating> out of 5 stars" ... "Reviewed in <loc> on <date>".
  // The {0,400} gap keeps us inside one review block — the product's overall
  // average rating sits far from any "Reviewed in" and so won't match.
  // Capture: rating | middle (title + permalink) | date | tail (body region).
  // Date appears as either "May 30, 2026" (US, month-first) or "8 December 2025"
  // (IN/UK, day-first, no comma). Accept both.
  const re =
    /(\d(?:\.\d)?)\s*out of 5 stars_?([\s\S]{0,400}?)Reviewed in [^\n]*? on (\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})([\s\S]*?)(?=(?:\n\s*\*\s)|(?:\d(?:\.\d)?\s*out of 5 stars)|$)/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const [, ratingStr, middle, dateStr, tail] = m;
    const rating = Number.parseFloat(ratingStr);
    const idMatch = middle.match(/\/(?:review|gp\/customer-reviews)\/(R[A-Z0-9]+)/);
    const titleMatch = middle.match(/#####\s*(?:\[([^\]]+)\]|([^\n]+))/);
    const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? '').trim();
    const body = cleanBody(tail);
    if (!body) continue;

    // The same review can render twice (collapsed + expanded). De-dupe by id.
    const reviewId = idMatch?.[1];
    if (reviewId) {
      if (seenIds.has(reviewId)) continue;
      seenIds.add(reviewId);
    }

    out.push({
      reviewId,
      rating: rating >= 1 && rating <= 5 ? rating : null,
      date: toIsoDate(dateStr),
      title,
      body,
    });
  }
  return out;
}

// Platform / listing / fulfillment problem signals — the use-case-relevant axis
// for Amazon product reviews. The /dp/ "top reviews" skew positive and
// product-focused, which is noise for us; this keeps only reviews that either
// rate low (a dissatisfied customer) or mention a platform/listing/fulfillment
// problem (counterfeit, damaged, wrong item, return/refund, seller, etc.).
const PROBLEM_RE = new RegExp(
  [
    'counterfeit', 'fake', 'knock[\\s-]?off', 'replica', 'inauthentic', 'not genuine',
    'damaged', 'broken', 'defective', 'cracked', 'leak(?:ed|ing)?',
    'not as described', 'different from (?:the )?(?:listing|picture|photo|description)',
    "doesn'?t match", 'wrong (?:item|product|size|colou?r|version)',
    'missing', 'never (?:arrived|came|delivered)', 'not delivered', "didn'?t (?:arrive|come)",
    'return', 'refund', 'money back', 'replacement', 'exchange',
    'seller', 'third[\\s-]?party', '3rd party', 'marketplace',
    'expired', 'used (?:item|product)', 'second[\\s-]?hand', 'opened box', 'previously opened',
    'warranty', 'scam', 'fraud', 'ripped off',
  ].join('|'),
  'i',
);

/** Keep low-rated (<=3) reviews or any non-5-star review naming a platform/
 *  listing problem. The 5-star exclusion drops keyword false positives like
 *  "I'll return to buy more" in glowing reviews — a genuine platform complaint
 *  almost never comes with a perfect rating. */
export function isPlatformRelevant(r: ParsedReview): boolean {
  if (r.rating !== null && r.rating <= 3) return true;
  if (r.rating === 5) return false;
  return PROBLEM_RE.test(`${r.title} ${r.body}`);
}

interface WatchEntry {
  asin: string;
  tld: string; // amazon marketplace TLD, e.g. "com", "in"
}

function readWatchList(rows: Record<string, string>[]): WatchEntry[] {
  const out: WatchEntry[] = [];
  for (const r of rows) {
    const asin = (r['ASIN'] ?? '').trim();
    if (!asin) continue;
    const raw = (r['Marketplace'] ?? 'com').trim().toLowerCase();
    const tld = raw.replace(/^amazon\./, '').replace(/^\./, '') || 'com';
    out.push({ asin, tld });
  }
  return out;
}

async function fetchJina(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(JINA_BASE + url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[amazon] Jina HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[amazon] Jina fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function reviewsForAsin(entry: WatchEntry, markdown: string): RawSignal[] {
  const parsed = parseAmazonReviews(markdown);
  const relevant = parsed.filter(isPlatformRelevant);
  if (relevant.length !== parsed.length) {
    console.log(
      `[amazon] ${entry.asin}: ${relevant.length}/${parsed.length} review(s) passed the relevance filter`,
    );
  }
  return relevant.slice(0, PER_ASIN_CAP).map((p) => {
    const text = p.title && !p.body.startsWith(p.title) ? `${p.title}. ${p.body}` : p.body;
    const idPart = p.reviewId ?? `${entry.asin}:${hash(p.body)}`;
    return {
      text,
      source: 'amazon_review',
      date: p.date,
      rating: p.rating,
      severity_raw: null,
      app_version: null,
      source_id: `amazon:${idPart}`,
    };
  });
}

/**
 * Fetch + parse reviews for every ASIN in the Watch Listings tab. Per-ASIN
 * failures are swallowed; an empty/missing watch list yields []. ASINs are
 * fetched concurrently (one Jina call each).
 */
export async function loadAmazonSignals(opts: { limit?: number } = {}): Promise<RawSignal[]> {
  const env = getEnv();
  const { limit = 50 } = opts;

  let watch: WatchEntry[];
  try {
    watch = readWatchList(await readRows(env.SHEETS_WATCH_TAB));
  } catch (err) {
    console.warn(
      `[amazon] could not read "${env.SHEETS_WATCH_TAB}" (skipping Amazon source):`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
  if (watch.length === 0) {
    console.log('[amazon] watch list empty; skipping.');
    return [];
  }

  const perAsin = await Promise.all(
    watch.map(async (entry) => {
      const url = `https://www.amazon.${entry.tld}/dp/${entry.asin}`;
      const md = await fetchJina(url);
      if (!md) return [];
      const signals = reviewsForAsin(entry, md);
      console.log(`[amazon] ${entry.asin} (.${entry.tld}): ${signals.length} review(s)`);
      return signals;
    }),
  );

  const all = perAsin.flat().slice(0, limit);
  console.log(`[amazon] collected ${all.length} review(s) across ${watch.length} ASIN(s)`);
  return all;
}
