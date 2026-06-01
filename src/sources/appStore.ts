import type { RawSignal } from '../types.js';

// Amazon Shopping app on the (US) App Store.
const AMAZON_APP_ID = '297606951';
const PAGE_SIZE = 50; // iTunes RSS returns up to 50 entries per page (max page=10).

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
 * Fetch the newest Amazon Shopping app reviews from the iTunes Customer Reviews
 * RSS feed (public, no auth, JSON). Fails soft: on any error returns whatever
 * was collected so far (possibly []), so one bad source never aborts a run.
 */
export async function loadAppStoreSignals(
  opts: { limit?: number; country?: string } = {},
): Promise<RawSignal[]> {
  const { limit = PAGE_SIZE, country = 'us' } = opts;
  const pages = Math.max(1, Math.ceil(limit / PAGE_SIZE));
  const out: RawSignal[] = [];

  try {
    for (let page = 1; page <= pages; page++) {
      const url =
        `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}` +
        `/id=${AMAZON_APP_ID}/sortBy=mostRecent/json`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[appStore] page ${page} returned HTTP ${res.status}; stopping pagination.`);
        break;
      }
      const data = (await res.json()) as RssFeed;
      const entry = data.feed?.entry;
      const entries = Array.isArray(entry) ? entry : entry ? [entry] : [];
      const mapped = entries
        .map(mapEntry)
        .filter((s): s is RawSignal => s !== null);
      out.push(...mapped);
      if (mapped.length === 0 || out.length >= limit) break;
    }
  } catch (err) {
    console.error(
      '[appStore] fetch failed (continuing with what we have):',
      err instanceof Error ? err.message : err,
    );
  }

  console.log(`[appStore] collected ${out.length} review(s)`);
  return out.slice(0, limit);
}
