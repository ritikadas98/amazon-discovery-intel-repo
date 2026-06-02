# Live Data Ingestion — build & working notes

A narrative reference for Track 2 (live ingestion). Built 2026-06-02. For the
terse reference see `CLAUDE.md` §9/§10/§15/§17; for rationale see `DECISIONS.md`
(2026-06-02 entries). This doc is the "how and why it hangs together" story.

---

## 1. What it is

Replaces the mock fixture with **real customer reviews** from three sources,
pulled on each pipeline run when `USE_MOCK=false`:

1. **App Store** — reviews of the Amazon Shopping app (iTunes RSS).
2. **Play Store** — reviews of the Amazon Shopping app (google-play-scraper).
3. **Amazon product reviews** — reviews on individual product listings, via
   Jina Reader, for a curated ASIN watch list.

Everything downstream (clean → regression → synthesize → RICE → digest) is
unchanged; live ingestion only swaps what `Step 1` of `run.ts` produces.

## 2. The contract every source satisfies

A source returns `RawSignal[]`:
```ts
{ text, source, date /* YYYY-MM-DD */, rating /* 1-5|null */,
  severity_raw: null, app_version: string|null, source_id?: string }
```
`source_id` was **added** for this feature. It's a stable per-review identity
used only for cross-run dedup (e.g. `app_store:14127690220`). `normalize()`
rebuilds RawSignal objects and drops `source_id` — which is fine, because dedup
happens at ingestion, *before* normalize.

## 3. The three sources

### App Store — `src/sources/appStore.ts`
- iTunes Customer Reviews RSS: `…/rss/customerreviews/page=N/id=297606951/sortBy=mostRecent/json`. Public, no auth, JSON. 50 reviews/page.
- Each entry has a native `id` → `source_id = app_store:<id>`. Maps `im:rating`
  → rating, `im:version` → app_version, `updated` → date, `title + content` →
  text. The first feed entry is app metadata (no rating) and is skipped.
- Retry-on-empty (3 attempts) + logs HTTP status / entry count per attempt.
  **Gotcha: do NOT send a custom `User-Agent`/`Accept` header** — Apple returns
  an empty feed (HTTP 200, 0 entries) for those; plain `fetch` works.
- **Country-IP match:** Apple's reviews RSS only serves reviews to an IP whose
  country matches the store path. `/us/` returns 50 from a US/residential IP but
  EMPTY from the India Cloud Run IP; `/in/` is the reverse. So the source tries
  `['in','us']` in order — Cloud Run (asia-south1) gets India app reviews from
  `/in/`. Verified both directions locally.

### Play Store — `src/sources/playStore.ts`
- `google-play-scraper` v10 `reviews()` for `com.amazon.mShop.android.shopping`,
  newest-first. Returns `{ data: [...] }`; each review has `id` (reviewId),
  `score`, `text`, `version`, `date`. → `source_id = play_store:<id>`.
- **Fragile by nature** — it parses Play's private endpoints and can break when
  Google changes them, or be rate-limited/blocked from some IPs. So it **fails
  soft**: any error → returns `[]` and the run continues.
- (Type wart: the lib types `gplay.sort` as the enum *type*, so `sort.NEWEST`
  needs a small cast. Runtime is fine — `NEWEST = 2`.)
- Verified live: 50 reviews, 0 malformed, 50 unique IDs.

### Amazon product reviews — `src/sources/amazon.ts`
The hard one. Key findings from building it:
- The `/product-reviews/<ASIN>` page is **behind a sign-in wall** — Jina returns
  the login page. But the **`/dp/<ASIN>` product page** renders its public "top
  reviews" section, which Jina returns as ~100-200KB of markdown.
- `parseAmazonReviews(markdown)` extracts each review by anchoring on
  `"<rating> out of 5 stars" … "Reviewed in <loc> on <date>"`. It:
  - bounds the gap (≤400 chars) so the product's *overall* average rating
    (far from any "Reviewed in") isn't mistaken for a review,
  - handles **both date layouts**: US `"May 30, 2026"` and IN/UK
    `"8 December 2025"`,
  - de-dupes blocks that render twice (collapsed + expanded) by review id,
  - strips variant links (`[Colour: …]`), the Verified-Purchase link, and Jina's
    "double tap to read" boilerplate.
  - `source_id = amazon:<reviewId>` from the permalink, or
    `amazon:<asin>:<hash>` for international reviews that have no permalink.
- Watch list lives in the **`Watch Listings`** sheet tab (`ASIN | Marketplace`);
  marketplace TLD (`com`, `in`, …) selects the domain to fetch.
- **Relevance filter** — see §6. **Fails soft** per ASIN and overall; 45s
  fetch timeout; per-ASIN cap.
- Verified offline against real US + IN captures: 13 clean reviews each, both
  date layouts. **But yield is low/intermittent — see §6 and §8.**

## 4. Dedup — `src/sources/dedupe.ts` + the `Seen Signal IDs` tab

Monthly runs shouldn't re-process reviews already seen.
- `loadSeenIds()` reads the `Seen Signal IDs` tab into a `Set<string>`. Missing
  tab → **fails open** (treats all as new) so the first run after creating the
  tab populates it.
- `filterUnseen(signals, seen)` drops anything already seen (and de-dupes within
  the batch). Reviews with no `source_id` are kept (can't dedup them).
- `commitSeenIds(signals)` appends the ingested `source_id`s to the tab.

**Timing is deliberate:** seen IDs are committed **only after the Signals rows
are successfully written** (`run.ts` step 7). If the run crashes earlier
(Gemini hiccup, sheet error), the reviews are *not* marked seen and get
re-ingested next time — rather than being silently lost, never analyzed.

## 5. Pipeline integration — `src/pipeline/run.ts`

Step 1 branches on `USE_MOCK`:
```
USE_MOCK=true   → loadMockSignals()  (the fixture, unchanged)
USE_MOCK=false  → Promise.all([appStore, playStore, amazon]) .flat()
                  → loadSeenIds() → filterUnseen()
                  → throw if 0 new signals survive
                  → (later, after Signals write) commitSeenIds()
```
- Sources fan out **in parallel**; each fails soft, so one dead source never
  aborts the run.
- A **per-source cap** (`INGEST_MAX_PER_SOURCE`, default 50) keeps total volume
  ~150/run. This matters because `cleanSignals` stuffs *every* signal into one
  Gemini prompt — uncapped live volume would blow the token limit and the 120s
  Cloud Run timeout.

## 6. Why product reviews are filtered — `isPlatformRelevant()`

Our use case is **Amazon platform/listing quality** (counterfeits, commingled
inventory, wrong/damaged items, returns/refunds, listing accuracy), not product
opinions. But product reviews are mostly product opinions (*"great sound
quality"*) — noise for us, and they'd otherwise be synthesized into off-topic
themes.

`isPlatformRelevant(review)` keeps a review only if:
- it rates **≤3★** (a dissatisfied customer), **or**
- it's **non-5★ and names a platform/listing/fulfillment problem** (counterfeit,
  fake, damaged, "not as described", wrong item, missing/never arrived, return,
  refund, seller, third-party, expired/used, warranty, scam, …).

The 5★ exclusion on the keyword branch removes false positives like *"I'll
return to buy more"* in glowing reviews. Verified: 7/7 predicate cases pass; the
filter dropped 26/26 pure-praise reviews from two real product captures.

## 7. Operating it

**One-time sheet setup (before the first live run):**
- Create **`Seen Signal IDs`** tab — headers `Source ID` | `Seen At`.
- Create **`Watch Listings`** tab — headers `ASIN` | `Marketplace`, populated
  with the watch-list ASINs (mixed `.com`/`.in` is fine).

**Going live:** set `USE_MOCK=false` on the Cloud Run service, then trigger a
run. Mock data already in the sheet is preserved as history — week-over-week
compares the first live week against the last mock week, so mock serves as the
week-1 baseline.

**Relevant env vars** (`CLAUDE.md` §10): `USE_MOCK`, `INGEST_MAX_PER_SOURCE`,
`SHEETS_SEEN_SIGNALS_TAB`, `SHEETS_WATCH_TAB`.

## 8. Reliability & honest limitations

- **Play Store** is reliable (50/run from Cloud Run). **App Store** needs the
  country-matching store: from the India Cloud Run IP, `/us/` returns empty and
  `/in/` returns reviews — handled by the `['in','us']` fallback (see §3).
  Both are reviews *of the Amazon app* — on-use-case.
- **Amazon product reviews are best-effort and low-yield:**
  - The `/dp/` "top reviews" skew positive/helpful; the problem reviews (1-2★)
    that we actually want are behind the sign-in wall Jina can't pass.
  - Amazon sometimes serves Jina a **CAPTCHA page** instead of the product
    (observed during testing) → that ASIN yields `[]`.
  - So Amazon contributes little until we can reach critical reviews. The filter
    ensures it never *pollutes*; it just often returns nothing.
- Everything fails soft: a dead source, a missing tab, a CAPTCHA, or a parse
  miss degrades to fewer signals, never a crashed run. If *all* sources yield
  zero, the run throws clearly rather than emitting an empty digest.
- Low total volume still surfaces via the existing `dataQualityWarning`
  (`<40` signals, or a source at 0).

## 9. Future work
- A path to Amazon's critical (1-2★) reviews: authenticated fetch, or a paid
  reviews API. This is the main lever for making the Amazon source genuinely
  useful.
- Use the reserved **`Jina Cache`** tab to cache Jina responses (avoid re-fetch
  / rate limits).
- Per-source country/locale config (App/Play are hardcoded `us`).
- Pipeline split (ingest job + analyse job) **only if** a live run exceeds the
  120s Cloud Run timeout — deferred until measured.

## 10. File index
| File | Role |
|---|---|
| `src/sources/appStore.ts` | iTunes RSS → RawSignal[] |
| `src/sources/playStore.ts` | google-play-scraper → RawSignal[] |
| `src/sources/amazon.ts` | Jina /dp/ parse + `parseAmazonReviews` + `isPlatformRelevant` |
| `src/sources/dedupe.ts` | `loadSeenIds` / `filterUnseen` / `commitSeenIds` |
| `src/pipeline/run.ts` | `USE_MOCK=false` ingest branch + commit-after-write |
| `src/types.ts` | `RawSignal.source_id` |
| `src/config/env.ts` | `INGEST_MAX_PER_SOURCE`, `SHEETS_SEEN_SIGNALS_TAB`, `SHEETS_WATCH_TAB` |
| Sheet: `Seen Signal IDs`, `Watch Listings` | dedup state + ASIN watch list |
