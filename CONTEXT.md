# Project context — Amazon Discovery Intelligence

A master narrative for understanding *what this project is, why it's shaped
the way it is, and where it's going*. One of four project-level docs:

- **`CONTEXT.md`** (this file) — narrative + state + what's next. For humans.
- **`DECISIONS.md`** — per-decision log with PM rationale. For humans.
- **`CLAUDE.md`** — comprehensive self-contained handoff reference for AI
  assistants. Auto-loaded by Claude Code. Includes full pipeline detail,
  API reference, sheet schema, env vars, gotchas, how-to recipes, and a
  file-by-file map — designed to make a brand-new Claude instance
  productive without conversation context.
- **`ARCHITECTURE.md`** — the structural view: layer model, module contracts,
  invariants, pipeline ordering guarantees, trust boundaries, failure-mode
  matrix, extension points, and the honest list of architectural gaps. Read it
  before any change that crosses a layer boundary.

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

### Jun 3 — Repo security audit + hardening

Audited the public GitHub repo. Findings + actions:
- **Critical:** a live Gemini API key was committed in
  `.claude/settings.local.json` (slipped past `.gitignore` — `*.local` doesn't
  match `settings.local.json`). Key was revoked in AI Studio; the file +
  the legacy n8n exports were untracked and gitignored (the n8n files had been
  reintroduced by an earlier reset-to-origin).
- **High → fixed:** `nodemailer` 6 had SMTP-injection / mail-to-unintended-domain
  CVEs, and `/run-pipeline` took `recipient_email` from the public body with no
  format check. Upgraded to `nodemailer@^8.0.10`, added email-format validation
  + a recipient **allowlist** (`ALLOWED_RECIPIENTS`, falls back to
  `[DEFAULT_RECIPIENT]`), and added per-IP rate limiting (`express-rate-limit`).
  Removed the unused `node-cron` dep (cleared one vuln chain).
- **Deferred:** real auth (still `--allow-unauthenticated`); the remaining 4
  moderate `uuid`-via-googleapis advisories (need a breaking `googleapis` major;
  not attacker-reachable here). Cost backstop = a GCP billing budget alert (user).

### 16 Aug 2026 — the chat can be asked "why did you say that"

`compactDigest` dropped the Theme Breakdown column, so the assistant saw the week's
headline numbers but none of the per-theme reasoning underneath them. It could tell you
the top theme; it could not tell you why that theme was judged ready or blocked, because
the answer sat in a column nobody passed it.

The digest context now carries each theme's readiness, evidence gaps, next steps,
severity, trend and score, and the model can cite them inline as `[theme 2026-W33/t3]`.
The week prefix matters: theme ids are only unique within a run, so a bare `t1` means a
different theme depending on which digest is being read.

Held back deliberately: a second rule telling the model to distinguish what a customer
said from what the system concluded. One rule at a time, so it stays possible to tell
which change moved behaviour.

### 13 Aug 2026 — the dashboard was unreadable, and two of the reasons were real bugs

Ritika opened the live demo and could not read it. That is the only user signal this
project has ever had, and following it turned up more than clutter.

The theme cards printed `R 26 · I 3.4 · C 0.8 · E 1` next to a score of 85.6. Those
numbers multiply to 70.7. Two multipliers — version and trend — were applied by the
pipeline and never shown, and the score was computed at full precision while the parts
were rounded for display. So the arithmetic on screen did not close, on a project whose
whole pitch is that every figure is checkable. Separately, MoSCoW was computed per group
and stamped onto every theme inside it, so a theme scoring 2.4 sat next to one scoring
85.6 wearing the same "Must Have".

Fixed both, plus: readiness now runs on every group instead of only the top one (the
other six showed a badge with no reason), one plain-English vocabulary replaced three,
Report no longer opens on an error, and the six unexplained numbers per card collapsed
into a plain sentence with the full derivation behind "Show the scoring".

The frameworks stayed. Stripping RICE and MoSCoW out would have been the easiest way to
make the page readable and would have deleted the thing it is meant to demonstrate.

First tests in the repo (`src/pipeline/rice.test.ts`) pin the reconstruction identity so
the original defect cannot come back quietly. `scripts/preview-fixture.ts` serves a
digest built by the real scoring code with no Gemini call, for checking the UI without
spending credits.

**Not yet done:** the pipeline has not been re-run, so the live sheet still holds rows
scored the old way. Until a run happens, the deployed site shows the old numbers.

### 17 Aug 2026 — the third panel: what the evidence cannot settle

`WhatWeDontKnow` completes the three-claim block. Its data already existed as Agent 5's
`gap_reasons`, but it lived in a collapsed strip and on the report page, so the two
confident panels sat side by side with nothing next to them. A card that shows what it
counted and what it concluded, and stays quiet about what it cannot see, reads more
certain than the evidence is.

Marked with `?` rather than a warning triangle: these are open questions, not failures,
and the theme may still be the right thing to work on. The first recommended next step
renders inside it as "Would settle it", because a gap and the thing that closes it
belong together.

### 18 Aug 2026 — the email carries the decision, and has a way out

The weekly digest email led with a category label and a score, and linked nowhere: its
only links were the feedback buttons, pointing at the Cloud Run API host. Clicking one
landed a PM on a bare JSON host with nowhere to go, which was the last impression the
product left each week.

It now opens with Agent 6's headline, carries the action block with owner and cost, shows
consequence per group, and offers deep links that carry the week — a six-week-old email
still opens the week it was about. Feedback became "Doing this" / "Not this week", because
an inbox on Monday morning is where deferrals actually happen.

Two things were actively wrong. The delta printed "RICE 12 vs last week", a name the
formula no longer has. And `severity_delta` is null across a formula change, which the
email rendered as "First run" — the first v2 digest would have claimed week 33 was week
one. A run is now only "first" when no group has a delta at all.

`APP_BASE_URL` is new in `env.ts` and the deploy script, deliberately separate from
`PUBLIC_BASE_URL`: one variable doing two jobs is why the dead end existed.
`scripts/preview-email.ts` renders the template to a file and asserts eight properties,
because a template that compiles is not a template that reads correctly.

### 18 Aug 2026 — parity with the mockup, and the report rebuilt

The four remaining gaps are closed: gradient washes on the three panels, the cut line in
the ranking table, the gated options menu with coverage counts, metric chips with hover
definitions, and the three decision buttons.

Agent 6 also returns `options` and `options_leftover`. `covers` is the load-bearing
field — three options without it read as three equally good ideas — and the leftover line
names the complaints no option addresses, because a menu that hides its own gaps is worse
than none.

The report page was rebuilt around `ThemeDossier`: one section per problem, in the same
counted / inferred / unknown / act shape the digest card uses. It replaces two lists that
each held a third of every theme's story. The rebuild exposed two stale things — that
page described the pre-v2 formula, and `adjustedRice` still multiplied by trend, so
"Score" and "Your score" no longer shared a formula. Both fixed.

### 17 Aug 2026 — the chat cannot pass a conclusion off as a quote

`compactThemes` hands each theme to the model as `said` / `counted` / `inferred` rather
than one flat object. Customer words exist in exactly one place, so a system sentence
cannot be attributed to a customer while still technically quoting the payload — a test
asserts the quote appears in `said` and nowhere else.

The structure is the mechanism and the prompt rule is secondary. A rule alone is weak
when every field arrives in the same shape: following it takes effort and breaking it
takes none. This matters more now that Agent 6 writes mechanisms, which are the
system's reading and the part most likely to be wrong.

Cost, measured on a real digest: ~13.8KB of theme context per digest, three per request,
roughly 10k tokens. A size test caps it so it cannot grow silently.

### 17 Aug 2026 — the action names a metric, an owner and a price

Agent 6 also returns a `first_move`: kind, action, owner, effort, rationale. The action
block reads *Pull a number · Data · about a day* instead of "take it to the team that
owns this area", which is what a dashboard says when it has no opinion.

`kind` is where the argument lives. Reviews establish that something is wrong, never how
often, so the prompt pushes towards `query` and permits `ship` only when the fix is small
and already justified without a number. Agent 5's next steps were retargeted at the
themes that are not ready — the step that settles the gap it just named, never a fix for
a theme it has just called thin.

The move is validated all-or-nothing and independently of the headline: a step with no
owner reads as more certainty than the model produced, but a bad action should not cost
the finding.

### 17 Aug 2026 — Agent 6 writes the finding, for READY themes only

`src/agents/diagnose.ts` adds a `headline` and a `mechanism` to themes that cleared the
evidence bar — one to three a week. The headline replaces the category label; the
mechanism gets its own amber panel beside the green counted one, so a reader can tell an
argument from a fact at a glance.

Three properties matter. Scope: nothing else is diagnosed, so cost tracks decisions
rather than scraping, and a quiet week makes no call. Numbers: the model is given the
computed counts and may only echo them — validation strips version strings, scans the
remaining digits, and rejects anything it was not handed, because a headline that
contradicts the panel beside it destroys both. Failure: rejected text is simply absent,
and the stage is non-fatal, so a bad response costs a sentence rather than a run.

### 17 Aug 2026 — the evidence panel is counted, not generated

Every theme carries a `ThemeEvidence` block — sources, dominant version, consequence
tally, two verbatim quotes, date range — computed in `rice.ts` from the theme's own
signals. It renders as "What people reported", badged as counted so a reader can tell
fact from inference at a glance.

The principle: anything a `reduce` can produce must never be a prompt. It is cheaper, it
cannot hallucinate, and it cannot be steered by text inside a review. Only the middle
column of the artifact's card — the mechanism — genuinely needs a model, and that is the
next step rather than this one.

Two judgement calls are load-bearing. The second quote is chosen for being *unlike* the
first rather than next-most-severe, because severity alone kept returning two phrasings
of one complaint. And a version is only named at 2+ signals and 25%+ of the theme; the
fixture surfaced one at 1 of 14, which would have sent someone chasing a build for
nothing.

### 17 Aug 2026 — the score keeps only what changes the answer, and cost gets its own column

An audit of the 14 August run found that four of the six scoring inputs were effectively
constant across all twelve themes: effort was `1.0` twelve times out of twelve, trend was
`1.2` on every scored theme, version spanned `1.00–1.07`, and confidence took two values.
The score was complaint count times loudness, carrying four extra decimal places of
apparent rigour.

`system_rice` is now `reach × impact × confidence × version`. Effort and trend are still
computed and stored, and the derivation panel names them, but neither multiplies in.
Effort was the clearer cut: it belongs to the feature *group*, so it divided every theme
inside that group by the same number and could not reorder them — a regression discount
using the vocabulary of an effort estimate. The PM sets real effort in the report.

A second finding drove a new field. Severity rates how a review *sounds*, not what it
cost. In week 33's checkout theme the one signal where money actually moved wrongly
scored 4.0, below two blocked checkouts at 4.5. Every signal now carries a
`consequence` — money / lost / blocked / annoyance — assigned by Agent 1 beside severity,
and a theme takes the most costly tier present rather than the most common.

Changing the formula breaks week-over-week comparison exactly once, so the digest row now
stamps a `Formula Version` and `assignWoWDeltas` withholds score deltas across a version
change instead of publishing a ~17% fall that is really just the formula moving. Signal
and severity deltas are unaffected and still compare.

The same commit hardened Agent 1's prompt, since it reads third-party review text: the
untrusted block is fenced with the standing instruction restated *after* it, each review
is capped at 1,200 characters, control characters and bidi overrides are stripped, and
`consequence` is validated against the enum, falling back to the least costly tier so an
injection cannot promote itself.

**Two sheet headers must be added by hand before the next run** — `Consequence` on
Signals, `Formula Version` on Weekly Digests. `appendRows` aligns by header name, so
without them those values are silently dropped (hard rule 5).

**Not yet done:** the pipeline has not been re-run under FORMULA_VERSION 2. Existing rows
remain v1 and are correctly labelled as such.

---

## 4. Architecture today (high level)

> The diagram below is the orientation view. For the full structural
> treatment — layer model, module contracts, ordering guarantees, trust
> boundaries, failure modes, known gaps — see **`ARCHITECTURE.md`**.

```
┌──────────────────────────────────────────────┐
│  Frontend (React + Vite + shadcn)            │
│  Routes: /digest /signals /report /chat
│  Hosting: Vercel/Netlify (static Vite build; config in repo)
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
| `Weekly Digests` | One row per weekly run (top group + JSON arrays for all groups) | Writes on every run; the `Trend Direction JSON` + `Theme Breakdown JSON` headers were added 2026-06-01 |
| `Effort Estimates` | PM-set effort overrides per (theme, week) | Writes on Discovery Report effort-segment click |
| `Feedback` | PM 👍/👎 ratings per theme | Writes on email-button click |
| `Seen Signal IDs` | Cross-run dedup for live ingestion (`Source ID`, `Seen At`) | Written on live runs; create before first live run |
| `Watch Listings` | Amazon ASIN watch list (`ASIN`, `Marketplace`) | Read by the Amazon source; create + populate before first live run |
| `Jina Cache` | (placeholder, unused yet) | Reserved for caching Jina Reader responses |

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
- **RAG chat (Track 1) built + verified locally (2026-06-02)** —
  `/chat` route + `POST /webhook/chat` (SSE), streams a Gemini reply with
  clickable `[signal <ID>]` citations. Merged to master + **deployed to prod
  Cloud Run** (verified streaming live).
- **Live ingestion (Track 2) — LIVE in prod (2026-06-02).** Merged, deployed,
  `USE_MOCK=false`. First live run pulled 50 Play Store reviews → 32 analyzed →
  digest emailed; dedup committed; WoW compared vs the mock baseline. The
  `Seen Signal IDs` + `Watch Listings` tabs exist.
  - **App Store BLOCKED from Cloud Run (confirmed in prod).** Apple's reviews
    RSS returns HTTP 200 / 0 entries to the Google datacenter IP for BOTH
    `/in/` and `/us/` — a full IP-range block, not country-match (which only
    showed locally). App Store yields 0 in prod; works from a non-datacenter
    IP. iOS reviews need a proxy / residential egress / 3rd-party API (future).
    Play Store is the app-review source.
  - **Amazon source confirmed reading all 8 ASINs in prod**, but yields ~0:
    `.com` products are all-praise (relevance filter drops them), `.in` pages
    return CAPTCHAs. Mechanism works; these products just lack visible problems.
  - **Sources (2026-06-02):** all three run by default (`ENABLE_APP_STORE` /
    `ENABLE_AMAZON_PLP` default true) — "use whatever's substantial". A shared
    substance filter (`src/sources/substance.ts`, ≥25 chars & ≥5 words) is
    applied to all three; Amazon also keeps `isPlatformRelevant`. Play cap 150.
    Honest reality: Play Store is the dependable source; App Store is 0 from
    Cloud Run (Apple IP block) and Amazon PLP is thin. **Reddit** is the planned
    next source (same datacenter-IP-block risk as App Store).
  - Amazon source is best-effort/low-yield (positive top-reviews, CAPTCHAs).
- **Sample/Live data-source toggle (2026-06-02).** Each run is tagged `Sample`
  (mock) or `Live` (`Data Source` column on Signals + Weekly Digests); a top-bar
  toggle + provenance badge filter the whole dashboard by tag. Lets the demo
  show the curated analysis (Sample) and real data (Live) as two clear,
  navigable states without blending. Needs the `Data Source` header added to
  both sheet tabs before live runs populate it.
- **Trust-boundary quick fixes (2026-07-10).** Three small hardenings (see
  DECISIONS.md): chat now **verifies each citation** against the scoped signals
  (unresolved IDs show an amber "⚠ unverified" chip instead of a fake footnote,
  and a per-turn `citation_resolution_rate` is logged — the repo's first online
  eval metric); the **prompt-injection defense line** now sits in the three raw-
  text agents (`clean`/`synthesize`/`readiness`), not just `chat`; and Agent 1's
  **dropped duplicate/irrelevant signals are now counted** and surfaced in the
  digest row, run toast, and log. Needs the `Dropped Duplicate` + `Dropped
  Irrelevant` headers added to the Weekly Digests tab.
- **Chat eval persisted (2026-07-12).** The citation-resolution rate is no longer
  console-only: each citing turn POSTs to `/webhook/chat-eval` → a new `Chat
  Evals` sheet tab (rate per week/group/source + message preview). Turns the
  eval metric into a readable time series. Needs the `Chat Evals` tab created
  (8 headers — see DECISIONS.md / CLAUDE.md §9).

### In flight / pending user action

- _(resolved 2026-06-01)_ **Cloud Run redeployed.** Revision
  `amazon-discovery-00013-l9w` now serves the current code (`/webhook/*`
  endpoints, per-theme breakdown, feedback anchors, schema-aware Effort
  Estimates / Feedback writes). Verified live via `/health` and
  `/effort-overrides`.
- _(resolved 2026-06-01)_ **Weekly Digests headers added.**
  `Trend Direction JSON` and `Theme Breakdown JSON` are now in row 1 of
  the Weekly Digests sheet tab.
- With both resolved, the Report page's Theme RICE Breakdown table should
  populate on the next pipeline run (it was previously showing "No themes
  in this group's breakdown").

### Decided but not built

- **Frontend hosting (Vercel/Netlify)** — deploy config is in the repo
  (`frontend/.env.production`, `vercel.json`, `public/_redirects`); just needs
  the repo connected on Vercel or Netlify to go live.

---

## 6. What's next (and the order)

### Track 1 — RAG chat — DONE (2026-06-02, on `feat/rag-chat`)

A conversational interface for the existing corpus. Built as specified:

- **Architecture:** context-stuffing for v1, no embeddings/vector DB.
  `POST /webhook/chat` loads the latest 3 weekly digests + up to 200
  signals (scoped by `group`/`week`) and streams Gemini 2.5 Flash over
  SSE with the question + prior turns.
- **Frontend:** `/chat` route, streaming chat UI (`ChatPage`). The model
  cites `[signal <ID>]` with real signal IDs; `ChatMessage` badges any
  ID-shaped token and shows the signal text on hover.
- **Persistence:** session-only (no chat history in the sheet).
- **Verified:** locally end-to-end (Playwright + installed Chrome) — tokens
  stream, all cited IDs badge, tooltips resolve. Cost ~$0.001/turn.
- **Remaining:** deploy `feat/rag-chat` to Cloud Run; prod doesn't have
  `/webhook/chat` yet.

### Track 2 — Live ingestion — DONE (2026-06-02, on `feat/live-ingestion`)

All three sources built and verified per-source; `USE_MOCK=false` drives them:

1. **App Store** — iTunes Customer Reviews RSS, app `297606951`
   (`src/sources/appStore.ts`). Verified: 50 reviews, native ids.
2. **Play Store** — `google-play-scraper` for
   `com.amazon.mShop.android.shopping` (`src/sources/playStore.ts`). Fails
   soft (fragile by nature). Verified: 50 reviews, reviewIds.
3. **Amazon product reviews** — Jina Reader on `/dp/<ASIN>` pages, ASINs from
   the `Watch Listings` tab (`src/sources/amazon.ts`). The `/product-reviews/`
   path is sign-in-walled, so we parse the product page's public "top
   reviews". Verified offline against real US (.com) and IN (.in) captures —
   13 clean reviews each, both date layouts handled.

Dedup: `Seen Signal IDs` tab + `src/sources/dedupe.ts`; source_ids committed
only after the Signals write. Per-source cap `INGEST_MAX_PER_SOURCE` (50).
Pipeline stays single-job; split into ingest + analyse only if it exceeds
Cloud Run's 120s timeout (see `DECISIONS.md`). **Remaining: merge + deploy,
create the `Seen Signal IDs` + `Watch Listings` tabs, do the first live run.**

### Track 3 — Future / not committed

- **Frontend hosting on Vercel/Netlify** (config in repo; connect to deploy)
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
| ~~Which ASINs to watch for Amazon product reviews?~~ | _Resolved 2026-06-02:_ 8 starter ASINs provided (mixed .com/.in across cookware, electronics, beauty, grooming, home, grocery). They live in the `Watch Listings` tab and can be edited anytime without code changes. |
| **Where to put the chat — own page or slide-out panel?** | Defaulting to `/chat` as a new page; can revisit if PM workflow shows they want it as a panel from any page. |
| **Persistent chat history?** | Session-only for v1. If PMs want to revisit prior conversations, add a `Chat History` sheet tab later. |
| **Authentication?** | API is publicly invokable. Fine for internal dev; needs an answer (Firebase Auth? API key middleware? IAP?) before the frontend is on a real domain. |
| **Frontend hosting** | _Resolved 2026-06-02:_ Vercel/Netlify (over Firebase — user is fluent in them, better Vite DX). Config is in the repo; connect the repo to deploy. |
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
