import gplay from 'google-play-scraper';
import type { RawSignal } from '../types.js';
import { hasSubstance } from './substance.js';

// Amazon Shopping app on the Google Play Store.
const AMAZON_PACKAGE = 'com.amazon.mShop.android.shopping';

interface PlayReview {
  id?: string;
  date?: string;
  score?: number;
  title?: string | null;
  text?: string;
  version?: string | null;
}

/**
 * Fetch the newest Amazon Shopping app reviews from the Google Play Store via
 * google-play-scraper. This scraper is inherently fragile (it parses Play's
 * private endpoints and breaks when Google changes them), so it fails soft:
 * any error → returns [], and the run continues with the other sources.
 */
export async function loadPlayStoreSignals(
  opts: { limit?: number; country?: string; lang?: string } = {},
): Promise<RawSignal[]> {
  const { limit = 50, country = 'us', lang = 'en' } = opts;
  // Over-fetch so that after dropping short/low-detail reviews we can still
  // return up to `limit` substantive ones.
  const rawNum = Math.min(limit * 2, 300);
  try {
    // v10 returns { data, nextPaginationToken }; older returned a bare array.
    // The lib types gplay.sort as the enum *type*, so member access fails tsc
    // even though the runtime object has { NEWEST: 2, ... }. Cast around it.
    const NEWEST = (gplay.sort as unknown as { NEWEST: number }).NEWEST;
    const result = (await gplay.reviews({
      appId: AMAZON_PACKAGE,
      sort: NEWEST,
      num: rawNum,
      country,
      lang,
    })) as unknown as { data?: PlayReview[] } | PlayReview[];

    const reviews: PlayReview[] = Array.isArray(result) ? result : (result.data ?? []);

    const out: RawSignal[] = [];
    for (const r of reviews) {
      const id = r.id;
      const body = (r.text ?? '').trim();
      if (!id || !body) continue;
      const title = (r.title ?? '').trim();
      const text = title && !body.startsWith(title) ? `${title}. ${body}` : body;
      const score = typeof r.score === 'number' ? r.score : NaN;

      out.push({
        text,
        source: 'play_store',
        date: (r.date ?? '').slice(0, 10), // YYYY-MM-DD; normalize() re-validates
        rating: score >= 1 && score <= 5 ? score : null,
        severity_raw: null,
        app_version: r.version ?? null,
        source_id: `play_store:${id}`,
      });
    }

    const substantive = out.filter((s) => hasSubstance(s.text));
    console.log(
      `[playStore] collected ${out.length} raw, ${substantive.length} with substance ` +
        `(dropped ${out.length - substantive.length} short/low-detail)`,
    );
    return substantive.slice(0, limit);
  } catch (err) {
    console.error(
      '[playStore] fetch failed (continuing without Play Store):',
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
