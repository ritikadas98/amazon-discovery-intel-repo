# Decisions log

A running record of product + technical decisions, paired with the **PM
rationale** that drove each one. Newest at the top. Each entry is four
sections:

- **What changed** — the concrete artifact
- **PM rationale** — why this matters for the product / PM workflow
- **Mechanics** — brief tech summary with file pointers
- **Considered & not done** — alternatives we rejected, with reason

Use this file as the source of truth for "why is the system shaped this way."
When you make a new decision, add an entry at the top of the log (don't
overwrite history).

---

## 2026-06-02 — App Store: blocked from Cloud Run (prod disproved the `in` fix)

**What changed (finding, not code).** Prod logs after deploying the `['in','us']`
fallback showed **both** `[appStore:in]` and `[appStore:us]` returning
`HTTP 200, 0 entries` from the Cloud Run IP. So the country-match theory (from
local data) was only half the story: from the Google/Cloud-Run datacenter IP
range, Apple's reviews RSS is **blocked entirely** — no country works. App Store
yields 0 in prod; it works from a non-datacenter IP (local). The `['in','us']`
fallback is kept (harmless, and works off-Cloud-Run) and the comment/docs were
corrected to state the real cause.

**Decision.** Accept App Store as non-functional from Cloud Run for now — **Play
Store is the reliable app-review source** (Android; the larger market in India
anyway). iOS reviews would need a proxy / residential egress / 3rd-party reviews
API — deferred until iOS coverage is worth that infra.

**Also confirmed this run.** Amazon source reads the `Watch Listings` tab
correctly in prod (all 8 ASINs fetched) — the earlier "watch list empty" was a
timing artifact (data added after those runs). Amazon yields ~0 relevant
(positive `.com` products filtered; `.in` pages CAPTCHA) — the expected
low-yield, now confirmed in prod.

---

## 2026-06-02 — App Store fix attempt: country-matching store (`in` first)

**What changed.** `loadAppStoreSignals` now tries countries `['in','us']` in
order instead of `us` only.

**Root cause (diagnosed via the new logging).** Apple's Customer Reviews RSS
returns reviews ONLY to a requesting IP whose country matches the store path.
From the India Cloud Run IP, `/us/` returned `HTTP 200, 0 entries` (looked like
a throttle); from a US/residential IP, `/in/` returns 0 while `/us/` returns 50.
Verified both directions locally. So it was never a throttle or a header issue —
just a country/IP mismatch.

**Mechanics.** Try `/in/` first (Cloud Run is asia-south1 → India reviews), fall
back to `/us/`. India Amazon-app reviews are on-market and relevant. Pending
prod confirmation on the next redeploy.

**Considered & not done.** Forcing a single country — rejected; the fallback
works in both prod (India IP) and local (non-India IP) without per-env config.

---

## 2026-06-02 — Went live + App Store hardening + deploy default

**What changed.** Flipped `USE_MOCK=false` in prod — the pipeline now ingests
real reviews. First live run: Play Store 50 → normalize 45 → clean 32 → digest
emailed; 50 source_ids committed to `Seen Signal IDs`; WoW compared against the
15 prior mock digest rows (mock = week-1 baseline, as planned). Also:
- **App Store hardening** (`src/sources/appStore.ts`): retry-on-empty (3
  attempts, backoff) + per-attempt logging of HTTP status and raw entry count.
- **Header finding:** sending a browser `User-Agent` / `Accept: application/json`
  makes Apple's RSS return an EMPTY feed (HTTP 200, 0 entries) — verified
  locally. So the source uses **plain fetch (default headers)**; a comment warns
  against re-adding headers.
- **`scripts/gcp-deploy.sh`**: `USE_MOCK` now defaults to **false** (was
  hardcoded `true`, which silently reverted live on every redeploy). Override
  with `USE_MOCK=true bash scripts/gcp-deploy.sh`. The new ingestion env vars
  (`INGEST_MAX_PER_SOURCE`, `SHEETS_SEEN_SIGNALS_TAB`, `SHEETS_WATCH_TAB`) are
  now set explicitly by the deploy.

**PM rationale.** Live data is the whole point; mock served as the week-1
reference. The deploy-default flip removes a footgun (every prior redeploy would
have quietly switched prod back to mock).

**Known issue (open).** App Store returned **0 from Cloud Run** (asia-south1 /
Mumbai datacenter IP) while the feed is alive and local gets 50 — an Apple
IP/region throttle, not a header/code bug. The new logging will reveal exactly
what Apple returns in prod next run. Candidate fixes if it persists: request the
`in` store from the India IP, or accept App Store as best-effort. Play Store is
the reliable app-review source meanwhile.

**Considered & not done.** Custom UA / headers (made it worse). A heavier
retry/proxy for App Store — deferred until the prod logs confirm the throttle's
nature.

---

## 2026-06-02 — Amazon source: relevance filter (and its honest limits)

**What changed.** Added `isPlatformRelevant()` to `src/sources/amazon.ts`:
Amazon product reviews are kept only if they rate ≤3★ or (non-5★ and) name a
platform/listing/fulfillment problem (counterfeit, damaged, wrong item,
return/refund, seller, never-arrived, …). Pure product praise is dropped.

**PM rationale.** Product reviews are mostly opinions about the *product*
(*"great sound quality"*), not Amazon's platform/listing quality, which is our
use case. Unfiltered, they'd pollute the themes with off-topic clusters. The
filter keeps the use-case-relevant axis (counterfeits, fulfillment, returns,
listing accuracy — the June scope) and discards the rest.

**Honest limitation (verified).** For well-reviewed products the yield is ~0:
the `/dp/` page shows helpful/positive "top reviews," and the problem reviews
(1-2★) live behind a sign-in wall Jina can't pass. Tested against real
captures: US lip balm 13→0, IN earbuds 13→0 kept (all pure praise — correctly
dropped). Amazon also sometimes serves Jina a CAPTCHA page (observed on the
vacuum ASIN) → source returns []. So App Store + Play Store are the reliable
signal; Amazon is best-effort and will contribute little until we can reach
critical reviews (authenticated fetch / paid reviews API — future). The 5★
exclusion on the keyword branch removes false positives like "I'll return to
buy more" in glowing reviews.

**Considered & not done.** Reaching 1-2★ reviews via authenticated
scraping/paid API — out of scope for v1. Dropping the Amazon source entirely —
kept it (flag-gated, fail-soft, filtered) since it occasionally catches a real
listing/fulfillment complaint and costs nothing when empty.

---

## 2026-06-02 — Live ingestion (Track 2): three sources, dedup, caps

**What changed.** `USE_MOCK=false` now runs real ingestion instead of
throwing. Three sources under `src/sources/` fan out in parallel —
App Store RSS, Play Store (google-play-scraper), and Amazon product reviews
(Jina Reader on /dp/ pages) — deduped against a new `Seen Signal IDs` tab.
On `feat/live-ingestion`.

**PM rationale.** This is the point of the whole system — analyzing *real*
customer signal, not a fixture. Built incrementally (App → Play → Amazon),
each source verified against live data before the next, so we never debugged
three fragile external integrations at once.

**Mechanics + decisions inside this one.**
- **Incremental, verified-live per source.** App Store and Play Store each
  return 50 well-formed signals; the Amazon parser was developed against real
  Jina captures (US + IN).
- **Volume cap (`INGEST_MAX_PER_SOURCE`, 50).** `cleanSignals` stuffs every
  signal into one Gemini prompt; uncapped live volume would blow the token
  limit and the 120s timeout. ~150/run keeps us safe.
- **Commit Seen IDs only after the Signals write.** A mid-run failure then
  re-ingests next time instead of silently dropping never-analyzed reviews.
- **Per-source fail-soft.** Each source catches and returns `[]`; one dead
  source (Play scraper breaking, Jina rate-limited) never aborts the run.
  Run only throws if 0 new signals survive dedup across all sources.
- **Amazon: /dp/ not /product-reviews/.** The reviews path is sign-in-walled
  via Jina; the product page's public "top reviews" parse fine. Yields a
  handful per ASIN — expected. Parser handles US ("May 30, 2026") and IN/UK
  ("8 December 2025") date layouts; permalink review id → source_id, else a
  content hash. 8 starter ASINs (mixed .com/.in) live in a `Watch Listings`
  tab, editable without code.
- **source_id on RawSignal**, dropped by normalize — used only at ingest/dedup.

**Considered & not done.** Jina response caching (the reserved `Jina Cache`
tab) — deferred; not needed at this volume. Pipeline split (ingest/analyse)
— still deferred until a live run actually exceeds 120s. Auto-fallback to the
mock fixture when live is thin — rejected; the existing dataQualityWarning
already surfaces low volume, and silently swapping in mock data would mislead.

---

## 2026-06-02 — RAG chat (Track 1): streaming, endpoint name, citations

**What changed.** Built the RAG chat feature on `feat/rag-chat`:
`POST /webhook/chat` streams a Gemini reply (SSE) over a context-stuffed
corpus (latest 3 digests + up to 200 signals, scoped by group/week); a
`/chat` page renders the stream with clickable `[signal <ID>]` citations.

**PM rationale.** First conversational surface over the corpus — lets a PM
ask "what's hot in Returns this week?" instead of reading tables. Kept v1
cheap and shippable: context-stuffing (no vector DB) is ~$0.001/turn and
fine while the corpus is bounded (140 mock signals). Streaming because a
PM watching tokens appear reads as faster than a 5-10s blank wait.

**Mechanics.**
- `streamGemini()` (async generator over `:streamGenerateContent?alt=sse`)
  added beside `callGemini` in `src/lib/gemini.ts`; deliberately omits the
  `responseMimeType: application/json` that `callGemini` forces — chat is
  prose, not JSON. `src/agents/chat.ts` shapes context (compact digest
  fields, never the heavy JSON columns) and streams. `src/server.ts` adds
  the SSE endpoint (400 before headers flush; `event: error` after).
- Frontend: `ChatPage` + `ChatMessage`, a `chatStream` SSE reader in
  `api.ts` (EventSource is GET-only, so a manual `fetch` + reader).

**Decisions inside this one.**
- **Endpoint name `/webhook/chat`**, not the Gemini-draft's `/chat/stream`
  — matches the repo's `/webhook/*` POST convention and the name already
  committed in §6/§15.
- **Citation matching loosened.** Verification showed the model isn't
  consistent — it mixes `[signal <ID>]`, `signal <ID>`, and bare `<ID>`.
  v1 badges any ID-shaped token (`YYYY-WNN-index`) rather than only the
  bracketed form, so all citations become interactive.
- **No markdown library.** `react-markdown` isn't a dep; v1 renders text
  with `whitespace-pre-wrap` + the citation pass. Markdown is a later add.
- **Session-only history.** No `Chat History` sheet tab yet.

**Considered & not done.** Vector RAG / embeddings — deferred until the
corpus outgrows the prompt window (live ingestion will force this). A
non-streaming JSON variant — rejected for the worse felt-latency; the
generator design makes a fallback trivial if ever needed. Multi-turn
persistence — deferred to a later sheet tab.

---

## 2026-06-01 — Fix scheduler-update flag in gcp-deploy.sh

**What changed.** In `scripts/gcp-deploy.sh`, the "update existing job"
branch passed `--headers=` to `gcloud scheduler jobs update http`, which
rejects it (`unrecognized arguments: --headers`). Changed to
`--update-headers=`. The `create` branch keeps `--headers=` (valid there).

**PM rationale.** The deploy ran clean through Cloud Build, the new Cloud
Run revision, IAM, and `PUBLIC_BASE_URL` — only the final scheduler-update
step errored, on a repo with a pre-existing monthly job. The bug was
silent on first-ever deploys (which hit the `create` branch) and only
surfaced on the first re-deploy of an existing environment. Left
unfixed, every future redeploy would error at the end even though the
service deployed fine.

**Mechanics.** `gcloud scheduler jobs create http` accepts `--headers`;
`gcloud scheduler jobs update http` accepts `--update-headers` /
`--clear-headers` instead. One-line change in the update branch. Verified
by running the corrected `update http` command manually in Cloud Shell —
job `amazon-discovery-monthly` is `ENABLED`, next run 2026-07-01.

**Considered & not done.** Switching the update branch to a
delete-then-create — rejected as heavier and it would reset job history /
state. Keeping the update idempotent with the correct flag is simpler.

---

## 2026-06-01 — Expand CLAUDE.md to a self-contained handoff reference

**What changed.** `CLAUDE.md` rewritten from terse-reference (~110 lines)
to comprehensive handoff document (~600 lines). Now includes 18 sections:
pipeline-flow-in-detail (with the RICE formula, MoSCoW cuts, readiness
rubric, WoW logic written out explicitly), full API reference with
request/response shapes, frontend route map + component inventory, sheet
schema with example values, env var reference table, common gotchas with
resolution steps, how-to recipes for common operations, file-by-file map.

**PM rationale.** User is moving this project to a different Claude Code
instance and explicitly asked for "as detailed as possible." The doc has
to be sufficient on its own — no conversation context to fall back on.
Brevity is the wrong trade-off when the next assistant has zero prior
knowledge. Worth the token cost: every session loads it as the floor
context, and saving even one round-trip ("what's the RICE formula?") pays
for the tokens many times over.

**Mechanics.** Top of file states the use case ("fresh session in a new
Claude Code instance") and the rule that drift must be fixed in the same
commit that exposed it. Cross-references to `CONTEXT.md` for narrative
and `DECISIONS.md` for rationale — `CLAUDE.md` deliberately avoids
duplicating those.

**Considered & not done.** Splitting into multiple files
(`CLAUDE-architecture.md`, `CLAUDE-api.md`, etc.) — rejected because
Claude Code auto-loads `CLAUDE.md` but not supplementary files, and
fragmentation makes drift more likely. Keeping the original terse version
— rejected because the user explicitly said "as detailed as possible"
for the handoff use case.

---

## 2026-06-01 — Add CLAUDE.md as the third project doc

**What changed.** Added `CLAUDE.md` at the repo root — reference-shaped
instructions auto-loaded by Claude Code on every session in this repo.

**PM rationale.** The two existing docs (`CONTEXT.md` for narrative,
`DECISIONS.md` for rationale) are written for *humans*. An AI assistant
joining a session benefits more from a structured reference. Without
`CLAUDE.md`, the next Claude re-discovers things like "the Feedback header
is misspelled" or "appendRows aligns by header" each session.

**Mechanics.** Repo root `CLAUDE.md`. Cross-references `CONTEXT.md` and
`DECISIONS.md` so the AI doesn't read the same content twice. The "hard
rules" section codifies the default-update behaviour the user established
earlier today.

**Considered & not done.** Stuffing everything into `CONTEXT.md`
(rejected — different docs serve different audiences). Generating it
from code via a script (rejected — overkill).

---

## 2026-06-01 — Match the existing Sheet schema (don't migrate it)

**What changed.** Backend write/read code adapted to the **existing**
column names on the `Effort Estimates` and `Feedback` tabs instead of the
simpler schema I originally coded. The digest email's 👍/👎 URLs now carry
`feature_group_id` so the backend has it to write.

- `Effort Estimates` columns: `Theme ID | Feature Group ID | Week ID |
  Effort Value | Set By | Set At`
- `Feedback` columns: `Week ID | Feature Group ID | PM Email | Rating |
  Recieved At` (the "Recieved" misspelling is the existing header — code
  matches it as-is so writes land in the right column).

**PM rationale.** The sheet was built first; the code came second. When
they disagree, the sheet wins — PMs are already working with this schema
(maybe filtering, pivoting, etc. on `Feature Group ID` and `Set By`), and
forcing them to drop columns or rename headers would break that work.
Code is cheaper to change than a populated spreadsheet. Also matters that
`Feature Group ID` and `Set By` are *useful* — accountability columns the
original schema had but my code didn't.

**Mechanics.**
- `src/server.ts` — `/webhook/set-effort` now accepts `feature_group_id`
  and `set_by` in the body; writes the 6-column row. `/effort-overrides`
  reads `Effort Value` + `Set At`. `/webhook/digest-feedback` now accepts
  `feature_group_id` and `pm_email` query params; writes the 5-column row
  (with the misspelling preserved).
- `src/templates/digestEmail.ts` — `buildFeedbackButtons` bakes
  `feature_group_id` into the URL. All themes in the readiness block belong
  to the top group, so we use `topGroup.group_id` for that.
- `frontend/src/lib/api.ts` — `setEffort` signature gained `feature_group_id`
  and optional `set_by`.
- `frontend/src/components/report/ThemeRiceBreakdownTable.tsx` — passes
  `t.feature_group_id` when calling the mutation.

**Considered & not done.** Adding a migration step to align the sheet to
my original schema (bad — destructive on a populated sheet; rejection on
principle). Making `Set By` an authenticated user identity (rejected for
v1 — no frontend auth yet; defaults to `DEFAULT_RECIPIENT`).

---

## 2026-06-01 — Per-group DigestPage rebuild

**What changed.** Single-group DigestPage (e.g. `/digest?group=returns_refunds`)
now shows a focused, group-owner view instead of a filtered version of the
cross-group overview. Added 4 new components — ThemeListForGroup,
TopSignalsForGroup, SourceMixChart, GroupRiceTrend — and removed the
cross-group ranking table from the single-group layout.

**PM rationale.** The Lead PM looks at "All Groups." A feature PM (Returns,
Search, Checkout) opens the app to see *their group's* themes, signals, and
trend — not a filtered All-Groups view. The previous build wasted ~80% of
the screen showing the cross-group ranking table that didn't change when
you clicked into a group. That defeats the purpose of having a dedicated
group page in the IA.

**Mechanics.**
- `frontend/src/routes/DigestPage.tsx` — branches on `group === 'all'` into
  two layouts.
- `frontend/src/components/digest/ThemeListForGroup.tsx` — grid of cards,
  one per theme, with R/I/C/E + RICE + MoSCoW + trend. (Reads
  `Theme Breakdown JSON` — empty until the new backend has run once.)
- `frontend/src/components/digest/TopSignalsForGroup.tsx` — top 5 highest-
  severity signal texts for the group, with source + severity badges.
- `frontend/src/components/digest/SourceMixChart.tsx` — 3 horizontal bars
  showing % of signals from each source for the group.
- `frontend/src/components/digest/GroupRiceTrend.tsx` — line chart of this
  group's top RICE score across the last 10 weekly digests (pulled from
  `RICE Scores JSON` across weeks — works against pre-redeploy historical
  data too).
- Cross-group `RankingTable` is now only rendered when `group === 'all'`.

**Considered & not done.** Adding the same enriched per-group view to the
All Groups page (clutter — keep it as a cross-cutting overview). Adding a
"compare two groups" toggle (premature). Adding per-theme drill-down from
the theme cards (the Discovery Report already does this; one route per job).

---

## 2026-05-31 — Mock dataset expanded from 22 → 140 signals

**What changed.** `data/signals.json` rewritten to 140 sophisticated
Amazon-2026 issues: 10 v5.2 regression signals spread across 7 feature
groups, ~16 systemic signals per group, ~10 noise signals for the
irrelevance filter.

**PM rationale.** 22 signals couldn't stress-test cross-week trends, per-group
depth, or the readiness logic — every theme had 2-3 signals at best. 140
gives the LLM enough material to produce meaningful theme clusters per
group, exercises the dedup logic harder, and produces an actual signal
distribution to plot trends against. The 10 v5.2 signals are deliberately
distinct surfaces (checkout, account, prime, returns, product, search,
delivery) so Gemini can't collapse them via dedup — guaranteeing the
regression alert fires reliably.

**Mechanics.** `data/signals.json`. Stats:
74 rating-1 + 56 rating-2 + 10 noise. Sources: 70 amazon_review,
39 app_store, 31 play_store. Date range 2026-05-11 → 2026-05-17.

**Considered & not done.** Generating signals via an LLM (rejected — wanted
deliberately hand-tuned content with specific regression clusters, real
Amazon-2026 product pain points, and stable noise levels). Larger dataset
(500+) — diminishing returns; 140 is already over the synthesis prompt's
comfort zone.

---

## 2026-05-31 — Group-scoped IA + 5 enhancements

**What changed.** Frontend rebuilt with 3 group-scoped routes:
`/digest?group=X`, `/signals?group=X`, `/report?group=X`. Replaces the
earlier week-scoped Dashboard/History/WeekDetail layout. Backend extended
with 4 new endpoints (`/webhook/run-pipeline`, `/webhook/set-effort`,
`/effort-overrides`, `/webhook/digest-feedback`), per-theme R/I/C/E
breakdown, per-theme MoSCoW (inherited from group), per-theme readiness,
👍/👎 feedback anchors in the digest email, and new sheet columns
(`Trend Direction JSON`, `Theme Breakdown JSON`).

**PM rationale.** PMs own *feature groups*, not weeks. The first frontend
treated each weekly run as the unit of navigation; that doesn't match how
work is assigned or how a PM thinks ("what's hot in Checkout this week?",
not "what happened in week 22?"). Re-anchoring on groups makes the app
fit existing org structure.

The 5 enhancements round out the discovery framework: WoW deltas (am I
getting better or worse), regression alerts (urgent fires), feedback loop
(PMs vote on signal quality so we can tune the pipeline), data quality
warnings (epistemic honesty when the input is thin), and editable effort
(makes RICE actionable instead of just descriptive — a PM can adjust the
effort denominator and immediately see the priority shift).

**Mechanics.**
- Backend: `src/server.ts`, `src/pipeline/rice.ts`, `src/pipeline/format.ts`,
  `src/templates/digestEmail.ts`. New env vars `SHEETS_EFFORT_TAB`,
  `SHEETS_FEEDBACK_TAB`, `PUBLIC_BASE_URL`.
- Frontend: full rebuild under `frontend/src/{routes,components}/`, plus
  `frontend/src/lib/{colors,url-state}.ts` for the 7-group palette and
  URL-param hooks.
- Sheet manual edits: 2 new columns on Weekly Digests, headers added to
  the empty Effort Estimates + Feedback tabs.

**Considered & not done.**
- Multi-PM regression routing (`feature_group_id → PM email`) — rejected;
  single recipient is enough for now.
- Running Agent 5 (readiness) for all 7 groups instead of just the top —
  rejected; 7× Gemini cost for marginal coverage. Non-top groups get a
  deterministic readiness from the same 4-criteria rubric.
- Token-signed feedback URLs — rejected; internal use, low stakes.
- Per-theme MoSCoW via independent percentile cut across themes — rejected;
  inheriting the group's MoSCoW is simpler and the badge stays sensible.
- READY / PARTIAL / NOT_READY rename across the codebase — rejected; we map
  only at the group-level summary badge, theme-level keeps the original
  vocabulary.

---

## 2026-05-30 — Frontend stack: React + Vite + shadcn/ui + TypeScript

**What changed.** Greenfield frontend in `frontend/` subdirectory of the
existing repo. Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui +
React Router v6 + TanStack Query v5 + Recharts. Firebase Hosting target
for deploy.

**PM rationale.** The pipeline backend was working but the only "UI" was
the underlying Google Sheet — fine for debugging, not for daily PM use.
A frontend turns a working pipeline into a tool people open every Monday.
Sticking with the developer's existing JS-stack expertise (TS) keeps the
team scalable to one person without context-switching to a new ecosystem.

**Mechanics.** Monorepo layout: backend stays at repo root, frontend in
`frontend/`. Each app has its own `package.json` and Dockerfile. No
workspace tooling — kept simple until shared types actually become
painful.

**Considered & not done.**
- Next.js — overkill; no SSR needed since this is an internal dashboard
  reading from a stable API.
- Mantine / MUI instead of shadcn — shadcn's "copy code, own it" model
  fits a one-person team better; you can edit components in place.
- Mobile-first — explicitly deprioritized; data density doesn't fit phones.

---

## 2026-05-28 — Vertex AI (ADC auth) instead of AI Studio API key

**What changed.** All 3 Gemini calls migrated from
`generativelanguage.googleapis.com` (API key in header) to
`<region>-aiplatform.googleapis.com` (OAuth token from the Cloud Run
runtime service account). The `gemini-api-key` secret in Secret Manager
was deleted.

**PM rationale.** Twice during development the AI Studio API key was
auto-flagged as leaked by Google's scanners (because it appeared in chat
transcripts / pastes / etc.) and was disabled mid-deploy. That whole class
of incident — static key leak, scanner auto-disable, manual rotation —
disappears when auth is "the Cloud Run SA." No secret to leak, IAM does
the work.

**Mechanics.**
- `src/lib/gemini.ts` rewritten to use `GoogleAuth` from
  `google-auth-library` (transitive via `googleapis`).
- `roles/aiplatform.user` granted to the Cloud Run runtime SA on whatever
  project has Vertex AI enabled.
- Region defaults to `asia-south1` matching Cloud Run; model to
  `gemini-2.5-flash`. `thinkingLevel` mapped to Vertex's `thinkingBudget`.

**Considered & not done.**
- Anthropic / OpenAI as a second-source LLM — out of scope; switching the
  prompts would be invasive and the pipeline produces good output with
  Gemini.
- A separate billing project for Gemini — added complexity, the same
  project handles everything cleanly.

---

## 2026-05-24 — GCP Cloud Run hosting, n8n stack decommissioned

**What changed.** Old n8n Cloud Run service + Cloud SQL Postgres deleted.
New Cloud Run service `amazon-discovery` running the TypeScript backend,
scale-to-zero. Cloud Scheduler does the monthly cron. Google Sheets is
still the system-of-record.

**PM rationale.** The original infra (n8n + Postgres) was set up assuming
we'd keep using n8n. We didn't. Keeping Postgres alive at db-g1-small was
~₹1,100/mo for zero benefit. Cloud Run scale-to-zero matches the actual
workload (~30s, once a month + occasional on-demand) — ~₹40/mo total. $300
in GCP credits covers years.

**Mechanics.** `scripts/gcp-infra.sh` decommissions the old stack, enables
new APIs, sets up IAM and Artifact Registry. `scripts/gcp-deploy.sh`
deploys via `gcloud run deploy --source .` and creates the Cloud Scheduler
job. CORS is `*` for now — will lock to the Firebase origin once the
frontend has one.

**Considered & not done.**
- Render free tier — sleeps after 15 min idle, every monthly run pays the
  cold-start tax.
- Always-on VPS — wasteful for hours-per-month workload.
- GCE e2-micro free tier — works but adds systemd/nginx/cert ops burden.

---

## 2026-05-24 — Mock-only ingestion (no live scrapers in v1)

**What changed.** Ingestion is hardcoded to a 22-signal (later 140-signal)
mock fixture in `data/signals.json`. The original n8n workflow had a
"Mock or Live" branch — we kept the mock side, didn't implement Live.

**PM rationale.** Live ingestion (App Store / Play Store / Amazon
reviews) is its own engineering project — anti-bot measures, pagination,
rate limits, schema differences across stores. We don't need it to
*prove the product*. The pipeline's value is in the analysis (3 LLM
calls + RICE/MoSCoW/readiness), not in being a scraper. Validate the
analysis with fixtures, add live ingestion when the analysis is worth
feeding real data.

**Mechanics.** `src/sources/mockSignals.ts` reads `data/signals.json`.
`USE_MOCK=true` env var (currently always true). The Live branch is left
as a stub interface so live source modules can drop in later.

**Considered & not done.** Implementing Play Store live via the
`google-play-scraper` npm package (friendly, no anti-bot) — sized as
~half a day of work, deferred until v1 of the dashboard is in real PM use.

---

## 2026-05-24 — 22 sophisticated mock signals (replaced original 20)

**What changed.** Original 20 signals (generic "app crashed", "delivery
late") replaced with 22 detailed Amazon-2026 problems — counterfeit
SanDisk via commingled inventory, review variation laundering,
returnless-refund auto-recharge, undisclosed restocking fee, etc.

**PM rationale.** The pipeline's job is to find *real* product issues
worth a PM's attention. Feeding it superficial complaints means it
produces superficial themes. The first dataset was producing themes like
"Search issues" instead of "Search price filter resets after scrolling."
Tuning the input fixture to mirror real customer voice forces the
synthesis output to be specific and actionable — proves the pipeline
works on the kind of signals it'll see in production.

**Mechanics.** `data/signals.json`. 8 distinct v5.2 regression signals
spread across feature groups → reliably triggers the regression alert.

**Considered & not done.** Sourcing real Amazon app reviews — would need
~50+ reviews per group, scraping infra, and risk of leaking real
customer text into the LLM context. Hand-tuned fixtures are better for
iteration speed.

---

## 2026-05-23 — Google Sheets as system-of-record

**What changed.** Pipeline output (signals + weekly digests + later
effort + feedback) persists to a single Google Spreadsheet across
multiple tabs. No application database.

**PM rationale.** PMs already live in spreadsheets. The Sheet is human-
browsable, sortable, shareable, supports comments + filters out of the
box. Zero migration cost from the original n8n workflow (which also wrote
to this same sheet). And it removes a whole category of ops work — no
backups, no schema migrations, no DB cost.

**Mechanics.** `src/lib/sheets.ts` (googleapis Sheets API + ADC auth).
Tabs: Signals, Weekly Digests, Effort Estimates, Feedback. Service
account `n8n-sa@…` has Editor access. `appendRows` aligns object keys
to row-1 headers — so the manual step when adding new columns is just
"add the header to row 1 of the relevant tab."

**Considered & not done.** SQLite as truth + Sheets as a human-readable
mirror — more code to maintain, no benefit until we hit a Sheets quota.
Postgres on Cloud SQL — wildly expensive for the volume (~7 rows / week
on Weekly Digests).

---

## 2026-05-23 — n8n workflow ported to a TypeScript codebase

**What changed.** Original n8n workflow JSON (29 nodes, JS-in-Code-nodes
plus HTTP/Sheets/Gmail nodes) converted to a Node.js + TypeScript
codebase with Express, googleapis, and Nodemailer. Each Code-node's body
moved verbatim into a `.ts` module; HTTP nodes became `fetch` calls in
`src/lib/gemini.ts`; the visual canvas of the workflow became
`src/pipeline/run.ts`.

**PM rationale.** The developer can't read the n8n canvas as fluently as
code. Maintenance, debugging, version control, and IDE tooling all
favor code. n8n's value was as a scaffolding to get the pipeline
working; once it worked, porting to code paid off in iteration speed.

**Mechanics.** Code in `src/` mirrors the workflow's logical stages:
`agents/{clean,synthesize,readiness}.ts` are the 3 Gemini calls;
`pipeline/{normalize,regression,aggregate,rice,wow,format}.ts` are the
deterministic stages; `templates/{digest,regression}Email.ts` render
HTML. `pipeline/run.ts` is the orchestrator.

**Considered & not done.** Python — workable but every JS Code-node would
have needed hand-translation. TypeScript was a direct port.

---

*To add a new decision, prepend a `##` entry above following the same
four-section frame. Keep PM rationale honest: if you can't articulate why
a PM should care, the decision is probably one you should reconsider.*
