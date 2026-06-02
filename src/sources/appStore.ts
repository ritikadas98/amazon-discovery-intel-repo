import type { RawSignal } from '../types.js';
import { hasSubstance } from './substance.js';

// Amazon Shopping app on the (US) App Store.
const AMAZON_APP_ID = '297606951';
const PAGE_SIZE = 50; // iTunes RSS returns up to 50 entries per page (max page=10).
const MAX_ATTEMPTS = 3;
// NOTE: do NOT send a custom User-Agent / Accept here. Apple's iTunes RSS
// returns an EMPTY feed (HTTP 200, 0 entries) for a browser-ish UA or
// Accept: application/json — verified locally. Plain fetch (undici default
// headers) is what returns reviews. The prod empties from Cloud Run are an
// IP/region throttle, not a header issue.
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface RssEntry {
  author?: { name?: { label?: string } };
  updated?: { label?: string };
  'im:rating'?: { label?: string };
  'im:version'?: { label?: string };
  id?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
}

interface RssFeed {
  feed?: { entry?: RssEntry | RssEntry[] };
}

/** Map one RSS entry to a RawSignal, or null if it isn't a review (the first
 *  feed entry is app metadata — no rating/content/id). */
function mapEntry(e: RssEntry): RawSignal | null {
  const id = e.id?.label;
  const content = (e.content?.label ?? '').trim();
  const ratingStr = e['im:rating']?.label;
  if (!id || !content || ratingStr === undefined) return null;

  const title = (e.title?.label ?? '').trim();
  const text = title && !content.startsWith(title) ? `${title}. ${content}` : content;
  const rating = Number.parseInt(ratingStr, 10);

  return {
    text,
    source: 'app_store',
    date: (e.updated?.label ?? '').slice(0, 10), // YYYY-MM-DD; normalize() re-validates
    rating: Number.isFinite(rating) ? rating : null,
    severity_raw: null,
    app_version: e['im:version']?.label ?? null,
    source_id: `app_store:${id}`,
  };
}

/**
 * Fetch one RSS page, retrying on transient failure or an empty feed. Apple
 * sometimes returns HTTP 200 with no entries to throttled (datacenter) IPs;
 * we retry a few times with backoff. Returns the raw entries (possibly []).
 */
async function fetchPage(url: string, country: string): Promise<RssEntry[]> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[appStore:${country}] HTTP ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
      } else {
        const data = (await res.json()) as RssFeed;
        const entry = data.feed?.entry;
        const entries = Array.isArray(entry) ? entry : entry ? [entry] : [];
        console.log(`[appStore:${country}] HTTP ${res.status}, ${entries.length} raw entries (attempt ${attempt})`);
        if (entries.length > 0) return entries;
      }
    } catch (err) {
      console.warn(
        `[appStore:${country}] fetch error (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err instanceof Error ? err.message : err,
      );
    }
    if (attempt < MAX_ATTEMPTS) await delay(800 * attempt);
  }
  return [];
}

/**
 * Fetch the newest Amazon Shopping app reviews from the iTunes Customer Reviews
 * RSS feed (public, no auth, JSON). Fails soft: on any error returns whatever
 * was collected so far (possibly []), so one bad source never aborts a run.
 */
export async function loadAppStoreSignals(
  opts: { limit?: number; countries?: string[] } = {},
): Promise<RawSignal[]> {
  // We try multiple country stores because Apple's reviews RSS only serves an IP
  // whose country matches the store path (verified locally: /us/ → 50, /in/ → 0).
  // KNOWN LIMITATION: from the Cloud Run (asia-south1) IP, BOTH /in/ and /us/
  // return HTTP 200 with 0 entries — Apple blocks the Google datacenter IP range
  // outright, so App Store yields 0 in prod regardless of country. It works from
  // a non-datacenter IP (local). Getting iOS reviews in prod needs a proxy /
  // residential egress / 3rd-party API. Play Store covers app reviews meanwhile.
  const { limit = PAGE_SIZE, countries = ['in', 'us'] } = opts;
  const out: RawSignal[] = [];

  for (const country of countries) {
    if (out.length >= limit) break;
    const pages = Math.max(1, Math.ceil((limit - out.length) / PAGE_SIZE));
    for (let page = 1; page <= pages; page++) {
      const url =
        `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}` +
        `/id=${AMAZON_APP_ID}/sortBy=mostRecent/json`;
      const entries = await fetchPage(url, country);
      if (entries.length === 0) break; // throttled/empty even after retries
      const mapped = entries.map(mapEntry).filter((s): s is RawSignal => s !== null);
      out.push(...mapped);
      if (out.length >= limit) break;
    }
  }

  const substantive = out.filter((s) => hasSubstance(s.text));
  console.log(
    `[appStore] collected ${out.length} raw, ${substantive.length} with substance ` +
      `(dropped ${out.length - substantive.length} short/low-detail)`,
  );
  return substantive.slice(0, limit);
}
