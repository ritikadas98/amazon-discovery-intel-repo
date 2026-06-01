# Project context — Amazon Discovery Intelligence

A master narrative for understanding *what this project is, why it's shaped
the way it is, and where it's going*. One of three project-level docs:

- **`CONTEXT.md`** (this file) — narrative + state + what's next. For humans.
- **`DECISIONS.md`** — per-decision log with PM rationale. For humans.
- **`CLAUDE.md`** — terse instructions for AI assistants (commands,
  conventions, gotchas). Auto-loaded by Claude Code.

If you're new to the codebase, read this top-to-bottom. If you're picking
up after time away, jump to **§5 — Current state** and **§6 — What's next**.

---

## 1. The product, in one paragraph

The pipeline ingests customer signals (App Store reviews, Play Store
reviews, Amazon product reviews) and converts them, weekly, into a
**PM-grade discovery digest**: themes ranked by RICE score, MoSCoW
priorities, week-over-week deltas, discovery-readiness assessments, and
regression alerts when an app version triggers a cluster of complaints.
The product audience is product managers — Lead PM (cross-cutting
overview) and feature PMs (Returns, Checkout, Search, etc.) who each own a
slice. The signals → digest pipeline runs on Cloud Run; results land in
Google Sheets and are consumed by both an email digest and a React
dashboard.

**Scope as of June 2026:** Amazon as a product *and* platform quality —
covers both the Amazon shopping app's UX and Amazon's product/listing
quality. Earlier scope was narrower (app UX only); we expanded when
adding live ingestion plans.

---

## 2. Origin

We started with an **n8n workflow JSON** (`Amazon Discovery
Intelligence(4).json`, 29 nodes) the developer inherited but couldn't
maintain — the visual canvas is not how a coder thinks. The workflow was
already doing the right thing: 6-stage pipeline (mock signals →
normalize → 3 Gemini calls → score → email + sheet writes), but locked
inside n8n's runtime.

**Mock-only ingestion** from day zero — the original workflow had a "live"
branch wired but unfunctional. The premise was: prove the analysis stage
on a fixture, add live ingestion when the analysis is worth feeding real
data. (We're now ready to flip that bit; see §6.)

---

## 3. The chronological story

### May 23 — n8n → TypeScript codebase

Each n8n Code node became a `.ts` module. The visual canvas became
`src/pipeline/run.ts` (the orchestrator). HTTP nodes became `fetch` calls
in `src/lib/gemini.ts`. Sheets and Gmail nodes used the `googleapis` and
Nodemailer SDKs. Mock signals fixture lives in `data/signals.json`.

Architecturally: stateless Express server, Vertex AI (after a stop on AI
Studio — see May 28), Google Sheets as system-of-record, deployed to
Cloud Run with scale-to-zero. No application database; the Sheet is the
DB. (See `DECISIONS.md` for full rationale.)

### May 24 — Mock dataset gets sophisticated

The original 20 signals were generic ("app crashed," "delivery late") and
produced generic themes ("Search issues"). Replaced with 22 hand-crafted
Amazon-2026 issues — counterfeit SanDisk via commingled inventory, review
variation laundering, returnless-refund auto-recharge, undisclosed
restocking fees, Subscribe & Save price creep. Forces the pipeline to
synthesise *specific*, *actionable* themes.

### May 24 — GCP hosting setup

Decommissioned the n8n stack (Cloud SQL Postgres + n8n container — saved
~₹1,100/mo). Set up Cloud Run + Cloud Scheduler for monthly cron + Secret
Manager for SMTP password. $300 in GCP free credits, ~₹40/mo run cost.
Scripts: `scripts/gcp-infra.sh` (one-time setup) and `scripts/gcp-deploy.sh`
(re-runnable deploy).

### May 28 — Vertex AI replaces AI Studio API key

The AI Studio API key got auto-flagged as leaked twice during development
(Google's scanners caught it in chat transcripts / pastes), each time
disabling the key mid-deploy. Migrated all 3 Gemini calls to
**Vertex AI generateContent** with **ADC** auth via the Cloud Run runtime
service account. No more static keys to leak. Same Gemini family, same
prompts.

### May 30 — Frontend v1 (week-scoped)

React + Vite + shadcn/ui + TS scaffold under `frontend/`. Three pages:
Dashboard (latest run), History (table of past runs), Week detail (drill
into a specific week). Worked, but…

### May 31 — Realisation: wrong IA

User shared a detailed UI spec — group-scoped, not week-scoped. The PM
mental model is "I own Returns; what's hot in Returns this week?" not
"What happened in week 22?". Week-scoped IA forced PMs to filter every
view themselves. **Frontend rewritten:** routes became
`/digest?group=X`, `/signals?group=X`, `/report?group=X`. Sidebar pivoted
to feature-group nav with a week selector.

### May 31 — The 5 backend enhancements

Same day as the IA flip, the backend grew five capabilities aligned with
the new spec:

1. **Week-over-week delta** — already computed in `wow.ts`, now fully
   exposed in `WoW Delta JSON` (richer than the previous severity-only
   delta).
2. **Version regression alert** — kept as-is, single-recipient (decided
   not to multi-PM-route yet).
3. **PM feedback loop** — 👍 / 👎 anchors injected into the digest email;
   clicks GET `/webhook/digest-feedback` and write to the `Feedback`
   sheet tab. Lightweight; no token signing for v1.
4. **Data quality warning** — already computed in `normalize.ts`,
   surfaced as a yellow banner in the DigestPage.
5. **Editable RICE effort** — segmented selector (XS/S/M/L/XL → 0.25/
   0.5/1/2/4) on the Discovery Report posts to `/webhook/set-effort`,
   writes to the `Effort Estimates` sheet tab, recomputes PM-adjusted
   RICE in real time on the client.

Also new: per-theme R/I/C/E breakdown exposed on `ScoredTheme`, per-theme
MoSCoW (inherits from group), per-theme readiness (AI-assessed for top
group, deterministic for the rest), two new sheet columns
(`Trend Direction JSON`, `Theme Breakdown JSON`).

### May 31 — 22 → 140 mock signals

The fresh dataset is meaningfully larger and more realistic — 10 distinct
v5.2 regression signals across 7 feature groups (so regression detection
fires reliably), ~16 sophisticated per-group complaints, 10 noise rows
for irrelevance filtering. Lets us stress-test cross-week trends and
per-theme depth.

### Jun 1 — Per-group DigestPage rebuild

User noticed: when you click a feature group in the sidebar, ~80% of the
DigestPage stayed identical to "All Groups" view — the cross-group
ranking table dominated and didn't change. Defeats the purpose of a
dedicated per-group page.

**Fix:** DigestPage now branches on `group === 'all'`. The **All Groups**
view keeps the cross-group ranking table. The **Single Group** view
swaps it out for four new components:

- `ThemeListForGroup` — cards per theme with R/I/C/E + RICE + MoSCoW +
  readiness + trend
- `TopSignalsForGroup` — top 5 signals by severity, inline
- `SourceMixChart` — % from app_store / play_store / amazon_review
- `GroupRiceTrend` — line chart of this group's RICE across 12 weeks

### Jun 1 — Schema accommodation

User's Sheet had richer Effort Estimates and Feedback schemas than the
code wrote to (extra `Feature Group ID` and accountability columns).
Adapted backend code to write the existing schema rather than asking the
user to migrate. Preserved the existing "Recieved At" misspelling on the
Feedback header so writes line up.

---

## 4. Architecture today (high level)

```
┌──────────────────────────────────────────────┐
│  Frontend (React + Vite + shadcn)            │
│  Routes: /digest /signals /report  /chat (planned)
│  Hosting: local dev now; Firebase Hosting later
└──────────────────────────┬───────────────────┘
                           │ HTTPS + CORS
                           ▼
┌──────────────────────────────────────────────┐
│  Cloud Run service: amazon-discovery         │
│  Endpoints:                                  │
│    GET  /health                              │
│    GET  /digests?week=X                      │
│    GET  /signals?week=X&group=Y              │
│    GET  /runs/latest                         │
│    GET  /effort-overrides?week=X             │
│    GET  /webhook/digest-feedback (HTML pg)   │
│    POST /run-pipeline | /webhook/run-pipeline│
│    POST /webhook/set-effort                  │
│                                              │
│  Pipeline (~30s, monthly via Cloud Scheduler)│
│  └── normalize → clean → regression → ───────┤
│      synthesize → aggregate → RICE → wow →   │
│      readiness → format → sheet writes →     │
│      digest email                            │
└──┬────────────┬────────────┬──────────┬─────┘
   │            │            │          │
   ▼            ▼            ▼          ▼
[Vertex AI] [Sheets API] [Secret Mgr] [Gmail SMTP]
            (Signals, Weekly Digests,
             Effort Estimates, Feedback,
             Jina Cache — future)
```

### Repo structure

```
amazon-discovery-n8n/   (root — backend lives here, despite the name)
├── src/                   Backend TypeScript
│   ├── server.ts          Express endpoints
│   ├── cli.ts             One-shot CLI runner
│   ├── pipeline/          Deterministic stages (normalize, regression,
│   │                      aggregate, rice, wow, format, run orchestrator)
│   ├── agents/            3 Gemini-call stages (clean, synthesize, readiness)
│   ├── lib/               Gemini client, Sheets wrapper, Email wrapper
│   ├── templates/         Digest + regression-alert email HTML
│   ├── sources/           mockSignals.ts (live sources coming)
│   └── config/            env.ts (zod-validated), featureGroups.ts
├── frontend/              React SPA
│   └── src/
│       ├── routes/        DigestPage, SignalsPage, ReportPage
│       ├── components/    digest/, report/, layout/, run-pipeline/, ui/
│       └── lib/           api.ts, colors.ts, parsers.ts, url-state.ts
├── data/signals.json      140-signal mock fixture
├── scripts/               gcp-infra.sh, gcp-deploy.sh
├── CLAUDE.md              AI-assistant instructions (auto-loaded)
├── CONTEXT.md             This file (narrative + state)
├── DECISIONS.md           Per-decision log (PM rationale)
└── n8n-gcp-hosting-guide.md  Original n8n hosting steps (kept for history)
```

### Sheet schema today

| Tab | Purpose | Status |
|---|---|---|
| `Signals` | One row per cleaned signal (text + metadata + theme tag) | Writes on every run |
| `Weekly Digests` | One row per weekly run (top group + JSON arrays for all groups) | Writes on every run; **needs 2 new column headers** (`Trend Direction JSON`, `Theme Breakdown JSON`) — pending user manual edit |
| `Effort Estimates` | PM-set effort overrides per (theme, week) | Writes on Discovery Report effort-segment click |
| `Feedback` | PM 👍/👎 ratings per theme | Writes on email-button click |
| `Jina Cache` | (placeholder, unused yet) | Will be used by Amazon product review scraper |

---

## 5. Current state — what works, what doesn't

### Working

- Backend code on Cloud Run (older revision — see "Not yet" below)
- Frontend builds + typechecks; local dev (`npm run dev`) renders the
  shell, sidebar, and routes correctly
- All sheet-read endpoints (`/digests`, `/signals`, `/runs/latest`) return
  data
- Pipeline runs end-to-end from `/run-pipeline` (old path)
- Digest + regression emails send
- DECISIONS.md + CONTEXT.md present at repo root

### In flight / pending user action

- **Cloud Run is on an older revision.** The new code (`/webhook/*`
  endpoints, per-theme breakdown, feedback anchors, schema-aware Effort
  Estimates / Feedback writes) is on `master` but the deployed service
  doesn't have it. User needs to run `bash scripts/gcp-deploy.sh` from
  Cloud Shell.
- **Two Weekly Digests headers not yet added.** `Trend Direction JSON`
  and `Theme Breakdown JSON` must be added to row 1 of the Weekly
  Digests sheet tab. Without them, even a fresh pipeline run won't
  populate those columns (the `appendRows` helper aligns by header
  name).
- **Until both of the above are done**, the Report page's Theme RICE
  Breakdown table shows "No themes in this group's breakdown."

### Decided but not built

- **RAG chat** — semantics + scope laid out (see §6); not started.
- **Live ingestion** — semantics + scope laid out (see §6); not started.
- **Firebase Hosting deploy of the frontend** — local dev only at the
  moment.

---

## 6. What's next (and the order)

### Track 1 — RAG chat (build first)

A conversational interface for the existing corpus.

- **Architecture:** Lightweight context-stuffing for v1. No embeddings.
  No vector DB. The endpoint loads the latest 3 weekly digests + the
  last 200 signals (filtered by `?group=` if set) and sends them to
  Gemini 2.5 Flash with the user's question + previous turns.
- **Frontend:** New route `/chat` with a streaming chat UI. Citations:
  the model is prompted to cite `[signal #ID]`; the frontend turns those
  into hover-cards / links.
- **Persistence:** Session-only for v1 (no chat history in the sheet
  yet).
- **Effort:** ~1 day.
- **Cost:** ~$0.001 per chat turn. Negligible.

### Track 2 — Live ingestion (build after RAG)

Three sources, in order of effort:

1. **App Store** (iTunes Customer Reviews RSS) — free, no auth, JSON.
   App ID `297606951` (Amazon Shopping). ~2h.
2. **Play Store** — unofficial `google-play-scraper` npm package.
   Package `com.amazon.mShop.android.shopping`. ~3h. Will break
   occasionally when Google changes Play Store HTML; needs a graceful
   fallback.
3. **Amazon product reviews** — Jina Reader (`r.jina.ai/<url>`) for the
   hard one. Needs a watch list of curated ASINs (see §7 — strategy is
   one ASIN per feature group, stored in a new `Watch Listings` sheet
   tab). ~1.5 days.

Combined live ingestion adds a new `Seen Signal IDs` mechanism to dedupe
across runs (so we don't re-process reviews we've already seen). Pipeline
stays single-job for now; split into ingest + analyse only if it starts
exceeding Cloud Run's 120s timeout. (See `DECISIONS.md` for why we
deferred the split.)

### Track 3 — Future / not committed

- **Firebase Hosting deploy** of the frontend
- **Authentication** in front of the API (currently `CORS_ORIGIN=*`,
  publicly invokable)
- **Vector RAG** (replacing context-stuffing) — only when the corpus
  outgrows the prompt window
- **Pipeline split** (ingest job + analyse job) — only when live
  ingestion makes single-job too slow
- **Multi-PM regression routing** — currently a single recipient

---

## 7. Open dilemmas / decisions still ahead

| Question | Why it's still open |
|---|---|
| **Which ASINs to watch for Amazon product reviews?** | Need user to curate 5-7 starter ASINs (one per feature group ideally). Without them, live-ingestion of product reviews can't begin. |
| **Where to put the chat — own page or slide-out panel?** | Defaulting to `/chat` as a new page; can revisit if PM workflow shows they want it as a panel from any page. |
| **Persistent chat history?** | Session-only for v1. If PMs want to revisit prior conversations, add a `Chat History` sheet tab later. |
| **Authentication?** | API is publicly invokable. Fine for internal dev; needs an answer (Firebase Auth? API key middleware? IAP?) before the frontend is on a real domain. |
| **Frontend hosting** | Firebase Hosting is the planned target but not deployed yet. Need to pick a domain (`amazon-discovery-xxx.web.app` or custom). |
| **Pipeline split timing** | We've deferred split until live ingestion proves it's needed. Worth re-evaluating after first live run. |
| **Notification volume from feedback loop** | The 👍/👎 anchors will produce one row per click. At low PM volume that's fine. If the corpus grows and feedback is encouraged, we may need aggregation/summary. |

---

## 8. How to use this document

- **For onboarding (human):** read top-to-bottom. Then skim `DECISIONS.md`
  for the tradeoffs.
- **For onboarding (AI assistant):** `CLAUDE.md` is auto-loaded first;
  treat this file as referenced from there.
- **For "what's the state right now":** §5.
- **For "what's coming next":** §6.
- **For "why is X this way":** check `DECISIONS.md` first (per-decision
  index), fall back to the chronological story in §3 here.
- **For commands + conventions + gotchas:** `CLAUDE.md`.
- **For deploy / sheet edits / debugging:** see `README.md`.

This file should be kept in sync with reality. When something material
changes — a phase completes, a dilemma resolves, an architectural
decision flips — update the relevant section here AND add an entry to
`DECISIONS.md`. The two together (plus `CLAUDE.md` for the AI-facing
view) are the project's institutional memory.

---

*Last meaningful update: 2026-06-01. Sources of truth that override
this file when they conflict: the actual code, the actual Sheet, the
actual deployed Cloud Run revision.*
