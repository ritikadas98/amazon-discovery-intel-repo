# CLAUDE.md

Comprehensive instructions for any AI assistant working in this repo.
Auto-loaded by Claude Code on every session. Designed to be **self-contained
enough that the assistant can be productive without external context** — the
expected use case is a fresh session in a new Claude Code instance.

If you find something in this file that's wrong or stale, **fix it in the
same commit that exposed the staleness**. Drift here costs the next person
hours.

---

## §0. Three-doc system at the repo root

| File | Audience | Role | Length |
|---|---|---|---|
| **`CLAUDE.md`** (this file) | AI assistants | Reference: commands, schemas, conventions, gotchas, how-to recipes | Long, scannable |
| **`CONTEXT.md`** | Humans | Narrative: chronological story, current state, what's next, open dilemmas | Long, narrative |
| **`DECISIONS.md`** | Humans | Per-decision log with PM rationale | Append-only at top |

All three are kept in sync with reality. **Every material change updates
all three in the same commit.** "Material" = new component, new endpoint,
schema change, scope shift, decision to not do something, dilemma resolved.
Skip the doc updates only for typo fixes, dep bumps, or throwaway
exploration — and tell the user when you do.

---

## §1. What this project is

**Amazon Discovery Intelligence** — a customer-signal analysis pipeline.

**Inputs:** customer reviews of the Amazon Shopping app (App Store + Play
Store) and reviews on individual Amazon product listings (planned, not
yet wired). Currently uses a 140-signal mock fixture in `data/signals.json`.

**Pipeline:** a monolithic ~30-second job that runs on a monthly cron OR
on-demand via HTTP. Six stages:
1. **Ingest** — load signals (mock for now)
2. **Normalize** — schema validation, compute `weekId`, flag data-quality issues
3. **Clean (Gemini)** — dedup, irrelevance filter, severity score 1.0–5.0, version-flagged boolean
4. **Detect regressions** — group version-flagged signals by version; cluster ≥5 = regression alert email
5. **Synthesize (Gemini)** — cluster into 3–6 specific themes per run, tag each signal with one of 7 feature groups
6. **Score** — RICE per theme, percentile-based MoSCoW per group, week-over-week deltas, discovery readiness (Gemini #3 on the top group, deterministic on others)

**Outputs:** rows appended to a Google Sheet (the system of record),
plus a styled HTML digest email and a styled regression-alert email when
applicable.

**Consumed by:**
- The Google Sheet itself (human-browsable)
- A digest email (PM inbox, includes 👍/👎 feedback buttons per theme)
- A React dashboard (`/digest`, `/signals`, `/report` — all `?group=X` scoped)

**Audience:** product managers — a Lead PM (cross-cutting view) and feature
PMs (Returns, Checkout, Search, etc.). The Discovery Report page is where
a PM adjusts effort estimates and the PM-adjusted RICE recomputes live.

**Scope:** "Amazon as a product / platform quality" — both the Amazon
Shopping app's UX *and* Amazon product/listing quality issues. (Earlier
scope was app UX only; expanded June 2026.)

---

## §2. Read first (then come back to this file)

When starting a fresh session in this repo, read:

1. **This file** — top to bottom.
2. **`CONTEXT.md`** §5 (current state) and §6 (what's next).
3. **`DECISIONS.md`** — top 3-5 entries to understand recent direction.
4. **`README.md`** — has the human-facing deploy + dev instructions.

Don't read the code wholesale before reading the docs. The code is large;
the docs index it.

---

## §3. Hard rules (do not violate)

1. **Always update `CONTEXT.md` + `DECISIONS.md` in the same commit as
   the code change.** Default behaviour for this project. (See §0.)
2. **Never amend commits.** Always make a new commit. If a pre-commit
   hook fails, fix the issue and create a NEW commit.
3. **Never `git push --force` to `master`.** Warn the user if asked.
4. **Preserve the `Recieved At` misspelling** on the Feedback sheet header.
   It's the existing column header; code must match it as-is so writes
   land in the right column.
5. **`appendRows` aligns by header name.** When you add a new sheet column
   in code, the user must add the header to row 1 of the appropriate tab
   manually — explain this in your message after the code change.
6. **Never paste secrets into source files or git history.** Use Secret
   Manager + env vars (`SMTP_PASS`, etc.). The Vertex AI API uses ADC,
   no key needed.
7. **Pipeline runs are not idempotent across the sheet** — they append
   new rows every time. Two consecutive runs = two new Weekly Digests
   rows. Don't write code that assumes "this row already exists."
8. **The Cloud Run service runs an older revision unless freshly deployed.**
   A 404 on a recently-added endpoint means "redeploy needed." Don't
   debug application code for HTTP 404s on `/webhook/...` paths.
9. **`USE_MOCK`** — the env/zod default is `true`, but **prod runs live**:
   `scripts/gcp-deploy.sh` now sets `USE_MOCK=false` by default (was hardcoded
   `true`), so redeploys keep live mode. `false` runs App Store RSS + Play Store
   + Amazon-via-Jina, deduped against the `Seen Signal IDs` tab; needs the
   `Seen Signal IDs` and `Watch Listings` tabs (see §9). Force mock with
   `USE_MOCK=true bash scripts/gcp-deploy.sh`. See §15.

---

## §4. The pipeline in detail

### Stage-by-stage flow

```
HTTP POST /run-pipeline  ────►  ┌───────────────────────────────┐
or Cloud Scheduler cron        │  src/pipeline/run.ts            │
                                │  Orchestrator (single function) │
                                └───────────────┬─────────────────┘
                                                │
   ┌────────────────────────────────────────────┼──────────────────────────────────┐
   │                                            │                                  │
   ▼                                            ▼                                  ▼
1. INGEST                                  2. NORMALIZE                       3. AGENT 1: CLEAN
src/sources/mockSignals.ts          src/pipeline/normalize.ts           src/agents/clean.ts
Reads data/signals.json             Validates schema, drops              Calls Gemini → dedup +
returns RawSignal[]                  short/invalid rows, computes        irrelevance + severity score
                                     weekId (e.g. "2026-W22"),           (1.0-5.0) + version_flagged
                                     sourceBreakdown,                    returns CleanedSignal[]
                                     dataQualityWarning

                                                                                  │
   ┌──────────────────────────────────────────────────────────────────────────────┘
   ▼
4. REGRESSION DETECTION                                            5b. AGENT 3: SYNTHESIZE
src/pipeline/regression.ts                                         src/agents/synthesize.ts
Groups signals by app version mentioned in text                    Calls Gemini → cluster into
≥5 in one version → regression flag                                3-6 themes, tag each signal
Fires regression alert email IN PARALLEL with rest                 with one of 7 feature_group_id
                                                                  returns TaggedSignal[]
   │                                                                              │
   ▼                                                                              ▼
5a. AGENT 5: READINESS                                          6. AGGREGATE + RICE + WOW
src/agents/readiness.ts                                          src/pipeline/{aggregate,rice,wow}.ts
Called only on the TOP group's themes                            Group signals by feature_group_id
Calls Gemini → READY/NEEDS_MORE_EVIDENCE/BLOCKED                 Score each theme with RICE
+ gap_reasons + recommended_next_steps                           Assign MoSCoW by percentile cut
returns ReadinessResult                                          Compute WoW deltas vs last week

   │                                                                              │
   └──────────────────────────────────┬───────────────────────────────────────────┘
                                      ▼
                            7. FORMAT + WRITE + EMAIL
                            src/pipeline/format.ts → emits row shapes
                            src/lib/sheets.ts → appends to Signals + Weekly Digests
                            src/templates/digestEmail.ts → digest HTML w/ 👍👎 anchors
                            src/lib/email.ts → SMTP send
                            returns PipelineResult { status, weekId, topGroup, topRiceScore, ... }
```

### RICE formula (used in `src/pipeline/rice.ts`)

For each theme:
```
system_rice = (reach × impact × confidence × version_multiplier) / effort × trend_multiplier
```

Where:
- **reach** = signal_count for that theme
- **impact** = avg severity score of the theme's signals (1.0–5.0)
- **confidence** = source diversity bonus: 0.6 (1 source), 0.8 (2), 1.0 (3+ sources)
- **version_multiplier** = `1 + (version_flagged_ratio × 0.2)` → range 1.0–1.2
- **effort** = `0.8` if the theme's group is in a regression cluster, `1.0` otherwise. Can be overridden per-(theme, week) via Discovery Report's effort selector → POST `/webhook/set-effort`.
- **trend_multiplier** = `1.2` (worsening), `1.0` (stable), `0.8` (improving)

**PM-adjusted RICE** (recomputed client-side on Discovery Report when an
effort segment is clicked):
```
pm_rice = (reach × impact × confidence) / chosen_effort
```
Note: PM-adjusted intentionally **omits** `version_multiplier` and
`trend_multiplier` — it's a simpler RICE.

### MoSCoW assignment

Computed after all groups are scored. Sort group RICE scores ascending,
find p25/p50/p75:
- ≥ p75 → **Must Have**
- ≥ p50 → **Should Have**
- ≥ p25 → **Could Have**
- below → **Won't Have**

Each theme inherits its **parent group's** MoSCoW (not its own percentile
cut). This is a deliberate simplification.

### Readiness rubric

For each theme, four criteria (each `strong | moderate | weak`):
1. **signal_volume** — strong: 3+ signals; moderate: 2; weak: 1
2. **source_diversity** — strong: 3 sources; moderate: 2; weak: 1
3. **severity_consistency** — strong: avg ≥4.0; moderate: 3.0-3.9; weak: <3.0
4. **trend_signal** — strong: worsening; moderate: stable; weak: improving

Strong-count maps to readiness:
- 3-4 strong → **READY**
- 2 strong → **NEEDS_MORE_EVIDENCE**
- 0-1 strong → **BLOCKED**

For the **top group's** themes, Gemini Agent 5 assesses these and may
override with nuance (it also produces `gap_reasons` + `recommended_next_steps`).
For **other groups**' themes, the deterministic rubric above runs in
`rice.ts:computeThemeReadiness`.

**Group-level readiness summary** on the Discovery Report displays:
- `READY` → "READY"
- `NEEDS_MORE_EVIDENCE` → "PARTIAL"
- `BLOCKED` → "NOT_READY"

Theme-level badges keep the original three labels.

### WoW deltas

After RICE, `src/pipeline/wow.ts` reads last week's Weekly Digests row
(if any), then for each group computes:

| Field | Meaning |
|---|---|
| `rice_delta` | this week's RICE − last week's RICE (1 decimal) |
| `rice_delta_pct` | percentage change vs last week, null on first run |
| `signal_delta` | this week's signal count − last week's count |
| `severity_delta` | this week's avg severity − last week's |
| `moscow_changed` | bool — did MoSCoW change |
| `moscow_prev` | last week's MoSCoW (for "(↑ was X)" badge) |
| `moscow_escalated` | true if moved up in priority (Could→Should, etc.) |
| `moscow_deescalated` | true if moved down |

Persisted to `Weekly Digests` → `WoW Delta JSON` column.

### Theme IDs are NOT stable

Gemini generates `theme_id` strings like `t1`, `t2`, … per run. **They are
not stable across weeks.** `t1` in week 22 may be a different theme than
`t1` in week 23. This is why effort overrides are keyed by
`(theme_id, week_id)` — see §6.5.

---

## §5. The 5 enhancements (functional spec)

### Enhancement 1 — Week-over-week delta
**Where:** `src/pipeline/wow.ts` + `Weekly Digests → WoW Delta JSON`.
**Fully implemented.** Surfaced in: DigestPage hero card (signal delta),
Ranking Table (Signal Delta column, MoSCoW escalation badge).

### Enhancement 2 — Version regression urgent alert
**Where:** `src/pipeline/regression.ts` + `src/templates/regressionEmail.ts`.
Threshold: ≥5 version-flagged signals referencing the same version
(`X.Y[.Z]` pattern in signal text).
Fires **immediately** during pipeline execution (in parallel with the
rest), not at the end. Recipient: single email from request body or env.
Decision (June 2026): no multi-PM routing, no separate Regression Alerts
log sheet write — kept simple.

### Enhancement 3 — PM feedback loop
**Where:** `/webhook/digest-feedback` GET endpoint + 👍/👎 anchor tags in
`src/templates/digestEmail.ts`.
Each readiness theme in the digest email gets two anchor tags. Clicking
either issues a GET that:
1. Appends a row to the `Feedback` sheet tab.
2. Returns a small "thanks, recorded ✓" HTML page.

**No prefetch protection / no signed URLs** in v1 — internal use, low
stakes. If Gmail's link-prefetch starts producing false clicks, add a
confirmation step on the GET endpoint.

### Enhancement 4 — Data quality warning
**Where:** `src/pipeline/normalize.ts` → `Meta.dataQualityWarning`.
Conditions (any → warning text):
- Total signals < 40
- amazon_review count = 0
- app_store count = 0

Surfaced as: yellow banner at the top of DigestPage, yellow banner in
digest email.

### Enhancement 5 — Editable RICE effort
**Where:** Discovery Report's `SegmentedEffortSelector` →
`POST /webhook/set-effort` → `Effort Estimates` sheet tab.
Options: XS=0.25, S=0.5, M=1.0, L=2.0, XL=4.0.
PM-adjusted RICE recomputes **client-side** in real time when an effort
segment is clicked (no round-trip to backend for recompute).
Keyed by `(theme_id, week_id)`. Read back via `GET /effort-overrides?week=X`
on Discovery Report mount.

---

## §6. API surface (full reference)

Base URL in prod: `https://amazon-discovery-34n34tq6za-el.a.run.app`
(reflected as `VITE_API_BASE_URL` in `frontend/.env` if overridden).

### `GET /health`
**Response 200:** `{ "status": "ok", "timestamp": "2026-06-01T12:34:56.789Z" }`

### `POST /run-pipeline` and `POST /webhook/run-pipeline` (aliases)
**Request body:** `{ "recipient_email": "you@example.com" }` (optional;
falls back to `DEFAULT_RECIPIENT` env var)
**Response 200:** `PipelineResult` (see `src/types.ts`)
```json
{
  "status": "complete",
  "weekId": "2026-W22",
  "signalCount": 20,
  "topGroup": "returns_refunds",
  "topRiceScore": 13.3,
  "topMoscow": "Must Have",
  "overallReadiness": "READY",
  "regressionCount": 1,
  "completedAt": "2026-06-01T12:34:56.789Z"
}
```
**Response 400:** `{ "error": "recipient_email is required..." }`
**Response 500:** `{ "error": "<failure message>" }`
**Latency:** ~25–50s. Set client timeout to 60s+.

### `GET /digests?limit=N&week=YYYY-WNN`
Read the Weekly Digests sheet. Both params optional. Default `limit=10`, max `100`.
**Response 200:** `{ count, returned, rows: DigestRow[] }`
Rows sorted by row_number desc (newest first).

### `GET /runs/latest`
The most recent Weekly Digests row as a flat object.
**Response 200:** `DigestRow` (the raw sheet row)
**Response 404:** `{ "error": "No runs yet." }`

### `GET /signals?week=X&group=Y&limit=N`
Read the Signals sheet, optionally filtered. Default `limit=500`, max `5000`.
`group=all` is treated as no filter.
**Response 200:** `{ count, returned, week, group, rows: SignalRow[] }`

### `POST /webhook/set-effort`
**Request body:**
```json
{
  "theme_id": "t1",
  "week_id": "2026-W22",
  "effort": 2.0,
  "feature_group_id": "returns_refunds",
  "set_by": "ritikadas98@gmail.com"
}
```
`set_by` is optional; defaults to `DEFAULT_RECIPIENT`.
Appends to **Effort Estimates** tab: `Theme ID, Feature Group ID, Week ID, Effort Value, Set By, Set At`.
**Response 200:** `{ "ok": true, "theme_id": "t1", "week_id": "2026-W22", "effort": 2.0 }`

### `GET /effort-overrides?week=X`
**Response 200:**
```json
{
  "week": "2026-W22",
  "overrides": [
    {
      "theme_id": "t1",
      "week_id": "2026-W22",
      "feature_group_id": "returns_refunds",
      "effort": 2.0,
      "set_by": "ritikadas98@gmail.com",
      "updated_at": "2026-06-01T12:34:56.789Z"
    }
  ]
}
```
Multiple writes for the same (theme_id, week_id) collapse to the latest by row_number.

### `GET /webhook/digest-feedback?theme_id=X&feature_group_id=Y&week_id=Z&rating=R&pm_email=E`
**Valid ratings:** `useful`, `not_useful`.
Appends to **Feedback** tab: `Week ID, Feature Group ID, PM Email, Rating, Recieved At`.
**Response 200:** small HTML thank-you page (browser-facing).
**Response 400:** plain text "Bad request: …"

### `POST /webhook/chat` (RAG chat, Track 1)
Streams a Gemini reply as **Server-Sent Events** (not JSON).
**Request body:**
```json
{
  "message": "What are the top complaints in scope this week?",
  "history": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }],
  "group": "returns_refunds",
  "week": "2026-W22"
}
```
`history`, `group`, `week` are optional. `group` omitted/`all` → no group filter.
Context is **stuffed, not retrieved** (no embeddings): latest 3 Weekly Digests
(compact fields) + up to 200 newest Signals scoped by group/week. The model is
told to cite evidence as `[signal <ID>]` using real `Signals.ID` values.
**Response (stream):** `text/event-stream`. Token frames are `data: {"text":"…"}`;
the stream ends with `event: done`; failures emit `event: error` with
`data: {"error":"…"}`. Headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
**Response 400 (before stream opens):** `{ "error": "message is required." }`
**Note:** session-only — no chat history persisted to the sheet.

---

## §7. Frontend route map

| Route | Component | Purpose |
|---|---|---|
| `/` | redirect to `/digest?group=all` | |
| `/digest?group=X[&week=Y]` | `DigestPage` | Default landing. Branches: All Groups view vs Single Group view |
| `/signals?group=X[&week=Y]` | `SignalsPage` | Paginated, filterable signal browser (5-tier severity, inline expand) |
| `/report?group=X[&week=Y]` | `ReportPage` | Discovery Report — theme RICE breakdown with editable effort, evidence gap cards, next steps |
| `/chat?group=X[&week=Y]` | `ChatPage` | RAG chat over the in-scope corpus; streams replies with clickable `[signal <ID>]` citations |
| `/*` | redirect to `/digest?group=all` | catch-all |

**URL params** (`?group`, `?week`):
- `group` — feature group ID or `all`. Read via `useActiveGroup()`. Defaults to `all`.
- `week` — `YYYY-WNN` format. Read via `useActiveWeek()`. Defaults to latest from `/digests`.
- Sidebar nav preserves these via `useScopedLinkBuilder()`.

---

## §8. Frontend component inventory

```
frontend/src/
├── App.tsx                       Routes definition
├── main.tsx                      Providers: ThemeProvider, QueryClient, Sonner
├── routes/
│   ├── DigestPage.tsx            Branches AllGroupsView vs SingleGroupView
│   ├── SignalsPage.tsx           Paginated table with 4 filters + row expand
│   └── ReportPage.tsx            Group Readiness + ThemeRiceBreakdown + EvidenceGapCards + NextSteps
│   └── ChatPage.tsx             RAG chat: streams POST /webhook/chat (SSE), resolves [signal <ID>] citations to in-scope signals
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx         Sidebar + TopBar + Outlet + persistent ChatFab (floating launcher → /chat). Fixed h-svh; only main scrolls
│   │   ├── Sidebar.tsx           Week selector + 7 group nav items + "All Groups" + last-run footer
│   │   └── TopBar.tsx            Page title + 3 page tabs (Digest/Signals/Report) + active group pill + theme toggle + Run pipeline button. (Chat is the floating FAB, not a tab.)
│   ├── chat/
│   │   └── ChatMessage.tsx         Renders a bubble; turns [signal <ID>] into badges with a tooltip showing the signal text
│   ├── digest/
│   │   ├── OpportunityHero.tsx       Hero card (group color border, top theme, severity/trend/delta)
│   │   ├── RankingTable.tsx          Cross-group ranking (only used in All Groups view)
│   │   ├── ReadinessAlert.tsx        Collapsible alert for problematic readiness themes
│   │   ├── DataQualityWarning.tsx    Yellow banner if dataQualityWarning is set
│   │   ├── SignalSparkline.tsx       7-day signal volume line chart
│   │   ├── ThemeListForGroup.tsx     Single-group: per-theme cards with R/I/C/E + RICE + MoSCoW
│   │   ├── TopSignalsForGroup.tsx    Single-group: top 5 highest-severity signals
│   │   ├── SourceMixChart.tsx        Single-group: 3-bar source split (app_store/play_store/amazon_review)
│   │   └── GroupRiceTrend.tsx        Single-group: line chart of this group's RICE across last 12 weeks
│   ├── report/
│   │   ├── GroupReadinessSummary.tsx       READY/PARTIAL/NOT_READY badge + counts
│   │   ├── ThemeRiceBreakdownTable.tsx     The table with editable effort, PM-adjusted RICE recompute
│   │   ├── SegmentedEffortSelector.tsx     XS/S/M/L/XL toggle group
│   │   ├── EvidenceGapCards.tsx            Red left-border cards for NEEDS_MORE_EVIDENCE / BLOCKED
│   │   └── NextStepsList.tsx               Top 5 themes by RICE with one-line action each
│   ├── run-pipeline/
│   │   ├── RunPipelineDialog.tsx     Confirm dialog → mutation → stepper → toast
│   │   └── PipelineStepper.tsx       Simulated 6-stage progress
│   ├── theme-provider.tsx            Dark/light + localStorage
│   ├── theme-toggle.tsx              Sun/Moon icon button
│   └── ui/                           shadcn components (button, card, badge, table, dialog, ...)
└── lib/
    ├── api.ts                    Typed fetch wrappers (api.runPipeline, api.digests, ...)
    ├── colors.ts                 7-group palette, severity tiers, MoSCoW/readiness classes
    ├── parsers.ts                parseDigestRow + JSON column decoders + formatWeekLabel
    ├── url-state.ts              useActiveGroup, useActiveWeek, useScopedLinkBuilder, usePageTitle
    └── utils.ts                  cn() helper from shadcn
```

---

## §9. Sheet schema (the system of record)

Spreadsheet ID: `1onm967wGWmy2YpwNJxr_UEDkFGb8Ibx22unKLXuKj3g`
URL: https://docs.google.com/spreadsheets/d/1onm967wGWmy2YpwNJxr_UEDkFGb8Ibx22unKLXuKj3g/edit

Service account `n8n-sa@project-1d1dace7-e18c-4de9-bbf.iam.gserviceaccount.com`
has Editor access.

### Tab: `Signals` (one row per cleaned signal)
| Column | Example | Notes |
|---|---|---|
| `ID` | `2026-W22-0` | `weekId-index` |
| `Text` | "Updated to 5.2 yesterday…" | The original signal text |
| `Source` | `app_store` | `app_store`\|`play_store`\|`amazon_review`\|`unknown` |
| `Date` | `2026-05-16` | YYYY-MM-DD |
| `Rating` | `1` | 1-5, may be empty |
| `Severity Score` | `4.8` | Gemini-assigned, 1.0-5.0 |
| `Feature Group ID` | `checkout_payment` | One of 7 valid IDs |
| `Theme ID` | `t1` | Gemini-generated per run, NOT stable across weeks |
| `Theme Label` | "5.2 update silently restores old address" | Human-readable |
| `Week ID` | `2026-W22` | ISO-ish week |
| `App Version` | `5.2` | May be empty |
| `Version Flagged` | `TRUE`\|`FALSE` | From clean stage |
| `Created At` | `2026-05-23T18:00:34.221Z` | ISO timestamp |

### Tab: `Weekly Digests` (one row per pipeline run)
| Column | Example | Notes |
|---|---|---|
| `Week ID` | `2026-W22` | |
| `Feature Group ID` | `returns_refunds` | The TOP group of this run |
| `Top Theme` | "Return flow and refund processing failures" | Top group's top theme label |
| `Signal Count` | `3` | Top group's signal count (NOT total) |
| `Avg Severity` | `4.3` | Top group's avg severity |
| `Trend Direction` | `worsening` | Top group's trend |
| `Top RICE Score` | `13.3` | |
| `Top MoSCoW` | `Must Have` | |
| `RICE Scores JSON` | `[{"id":"returns_refunds","score":13.3},…]` | All 7 groups |
| `MoSCoW JSON` | `[{"id":"returns_refunds","moscow":"Must Have"},…]` | All 7 groups |
| `Discovery Readiness JSON` | full `ReadinessResult` object | Top group only |
| `Overall Group Readiness` | `READY`\|`NEEDS_MORE_EVIDENCE`\|`BLOCKED` | |
| `Themes Ready Count` | `1` | Among top group's themes |
| `Themes Blocked Count` | `0` | |
| `Data Quality Warning` | `""` or warning text | |
| `WoW Delta JSON` | `[{id, rice_delta, signal_delta, severity_delta, moscow_escalated, moscow_prev, …}]` | Per-group |
| `Created At` | ISO timestamp | |
| `Trend Direction JSON` | `[{id, trend}]` | Per-group trend |
| `Theme Breakdown JSON` | array of `ThemeBreakdownEntry` | All themes across all groups with R/I/C/E |

### Tab: `Effort Estimates` (PM-set overrides, append-only)
| Column | Example |
|---|---|
| `Theme ID` | `t1` |
| `Feature Group ID` | `returns_refunds` |
| `Week ID` | `2026-W22` |
| `Effort Value` | `2.0` |
| `Set By` | `ritikadas98@gmail.com` |
| `Set At` | ISO timestamp |

Multiple writes for the same `(Theme ID, Week ID)` collapse to the latest
by row_number when read by `/effort-overrides`.

### Tab: `Feedback` (PM 👍/👎 clicks, append-only)
| Column | Example | Notes |
|---|---|---|
| `Week ID` | `2026-W22` | |
| `Feature Group ID` | `returns_refunds` | |
| `PM Email` | `ritikadas98@gmail.com` | Baked into email link at render time |
| `Rating` | `useful`\|`not_useful` | |
| `Recieved At` | ISO timestamp | **Misspelling is intentional** — matches existing header |

### Tab: `Seen Signal IDs` (live-ingestion dedup, append-only)
| Column | Example | Notes |
|---|---|---|
| `Source ID` | `app_store:14127690220` | `<source>:<native-id-or-hash>`; one per ingested review |
| `Seen At` | ISO timestamp | When it was first ingested |

Written only when `USE_MOCK=false`, after a successful Signals write. Read at
the start of each live run to skip already-seen reviews. **Create this tab
(with both headers) before the first live run** — missing tab fails open.

### Tab: `Watch Listings` (Amazon ASIN watch list for live ingestion)
| Column | Example | Notes |
|---|---|---|
| `ASIN` | `B07DY2QRF6` | Amazon product id (the `/dp/<ASIN>` segment) |
| `Marketplace` | `com` / `in` | TLD; `amazon.<tld>` is fetched. Defaults to `com` if blank |

Read by `src/sources/amazon.ts`. **Create + populate this tab before the
first live run** — empty/missing tab simply skips the Amazon source.

### Tab: `Jina Cache`
Reserved for caching Jina Reader responses (not used yet). Empty.

---

## §10. Env vars (full list)

Validated via `src/config/env.ts` (zod). Local: `.env`. Prod: Cloud Run env vars + Secret Manager.

| Var | Type | Default | Notes |
|---|---|---|---|
| `VERTEX_PROJECT_ID` | required | — | GCP project where Vertex AI API is enabled |
| `VERTEX_REGION` | optional | `asia-south1` | Vertex AI region |
| `VERTEX_MODEL` | optional | `gemini-2.5-flash` | Model name; `gemini-flash-latest` also works |
| `GOOGLE_APPLICATION_CREDENTIALS` | optional | — | Path to SA JSON. Only set locally; Cloud Run uses runtime SA via ADC |
| `SHEETS_DOCUMENT_ID` | required | — | `1onm967wGWmy2YpwNJxr_UEDkFGb8Ibx22unKLXuKj3g` |
| `SHEETS_SIGNALS_TAB` | optional | `Signals` | |
| `SHEETS_DIGESTS_TAB` | optional | `Weekly Digests` | |
| `SHEETS_EFFORT_TAB` | optional | `Effort Estimates` | |
| `SHEETS_FEEDBACK_TAB` | optional | `Feedback` | |
| `SHEETS_SEEN_SIGNALS_TAB` | optional | `Seen Signal IDs` | Live-ingestion dedup tab |
| `SHEETS_WATCH_TAB` | optional | `Watch Listings` | Amazon ASIN watch list |
| `INGEST_MAX_PER_SOURCE` | optional | `150` | Cap on newest reviews per live source per run (~200 ceiling before AI-call batching needed) |
| `ENABLE_APP_STORE` | optional | `true` | App Store source (0 from Cloud Run — Apple IP block; set false to disable) |
| `ENABLE_AMAZON_PLP` | optional | `true` | Amazon PLP/Jina source (usually thin; set false to disable) |
| `PUBLIC_BASE_URL` | optional | — | Used to render feedback links in digest email. Auto-set to the service URL by `scripts/gcp-deploy.sh` after deploy |
| `SMTP_HOST` | optional | `smtp.gmail.com` | |
| `SMTP_PORT` | optional | `465` | |
| `SMTP_USER` | required | — | Gmail address that sends |
| `SMTP_PASS` | required | — | **Secret Manager: `smtp-pass`** (Gmail app password, no spaces) |
| `EMAIL_FROM` | required | — | `From:` header |
| `DEFAULT_RECIPIENT` | optional | — | Fallback for `/run-pipeline` and the cron job |
| `PORT` | optional | `3000` | |
| `USE_MOCK` | optional | `true` | When `false`, runs live ingestion (App Store + Play Store + Amazon/Jina), deduped via the Seen Signal IDs tab |
| `CRON_SCHEDULE` | optional | `0 9 1 * *` | Cron string (used only if running an in-process scheduler; Cloud Run uses Cloud Scheduler) |
| `CORS_ORIGIN` | optional | `*` | Frontend origin. Switch to the Vercel/Netlify URL once the SPA is hosted |

Frontend env (only one var):
| Var | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | hardcoded prod URL | Override to `http://localhost:3000` for local backend dev |

---

## §11. Commands

### Backend (run from repo root)
```
npm install                  # one time
npm run typecheck            # tsc --noEmit
npm run build                # tsc → dist/
npm run dev                  # tsx watch src/server.ts (auto-restart on file change)
npm run run:once             # one-shot CLI run of the pipeline (skips HTTP server)
npm start                    # node dist/server.js (production-style)
```

### Frontend (run from `frontend/`)
```
cd frontend
npm install                  # one time
npm run dev                  # Vite dev server at http://localhost:5173
npx tsc -b --noEmit          # typecheck only
npm run build                # tsc -b && vite build → frontend/dist/
```

### GCP (run in Cloud Shell — the user's gcloud is authenticated there, not locally)
```
bash scripts/gcp-infra.sh      # one-time / idempotent infra setup
bash scripts/gcp-deploy.sh     # deploys backend + sets Cloud Scheduler + updates PUBLIC_BASE_URL
```

Triggering a pipeline run from Cloud Shell:
```
SERVICE_URL=$(gcloud run services describe amazon-discovery --region=asia-south1 --format='value(status.url)')
curl -X POST "$SERVICE_URL/webhook/run-pipeline" \
  -H 'Content-Type: application/json' \
  -d '{"recipient_email":"ritikadas98@gmail.com"}'
```

Tail Cloud Run logs:
```
gcloud run services logs read amazon-discovery --region=asia-south1 --limit=50
```

---

## §12. Architecture & external services

### What runs where
- **Cloud Run service `amazon-discovery`** (region `asia-south1`) — the Express backend. Scale-to-zero, max 2 instances, 120s timeout, 512Mi memory, 1 CPU.
- **Cloud Scheduler job `amazon-discovery-monthly`** — `0 9 1 * *` Asia/Kolkata, hits `/run-pipeline` with OIDC token. Service account `scheduler-invoker@…`.
- **Cloud Build** — invoked by `gcloud run deploy --source .`, uses the repo's `Dockerfile`.
- **Secret Manager** — `smtp-pass` (Gmail app password). The (deprecated) `gemini-api-key` secret should be deleted once Vertex AI migration is verified.
- **Artifact Registry** — Docker repo `amazon-discovery` (auto-created on first `--source` deploy).
- **Service accounts:**
  - `n8n-sa@…` — Cloud Run runtime SA. Has Sheets editor (via sheet sharing), Vertex AI user (via `roles/aiplatform.user` on the Vertex project), Secret Manager accessor for `smtp-pass`.
  - `scheduler-invoker@…` — Cloud Scheduler SA. Has `roles/run.invoker` on the Cloud Run service.

### External APIs hit
- **Vertex AI generateContent** — 3 calls per pipeline run (clean, synthesize, readiness). Region same as Cloud Run.
- **Google Sheets v4 API** — reads + appends rows on every run + every `/effort-overrides` GET + every feedback click.
- **Gmail SMTP** (`smtp.gmail.com:465`) — sends digest + regression alert emails via Nodemailer with app password.

### Dependencies (load-bearing)
**Backend:**
- `express` — HTTP server
- `googleapis` — Sheets v4 + GoogleAuth (transitively pulls `google-auth-library`)
- `nodemailer` — SMTP send
- `node-cron` — currently UNUSED on Cloud Run (Cloud Scheduler replaces in-process cron)
- `zod` — env validation
- `dotenv` — local `.env` loading
- `tsx` — dev runtime
- `typescript`

**Frontend:**
- `react` 19, `react-dom`, `react-router-dom`
- `@tanstack/react-query` v5 — all server state
- `@tailwindcss/vite` v4, `tailwindcss` v4 — styling
- `recharts` — sparkline + RICE trend + ranking bar chart
- `lucide-react` — icons
- `class-variance-authority`, `clsx`, `tailwind-merge` — shadcn helpers
- `radix-ui` — shadcn primitives

---

## §13. Conventions

### TypeScript
- `"strict": true` on both sides. ESM modules.
- Backend: `target: ES2022`, `moduleResolution: NodeNext`.
- Frontend: `target: es2023`, `verbatimModuleSyntax: true`, `noUnusedLocals: true`.
- `@/*` alias points to `frontend/src/*` (configured in both `tsconfig.app.json` and `vite.config.ts`).

### React
- Function components + hooks only.
- React Query for all server state. URL params + react-query cache are the
  state model — no Redux/Zustand/Context-besides-Theme.
- Mutations invalidate the relevant query keys on success (see `RunPipelineDialog` for the canonical pattern).
- Streaming, optimistic UI patterns OK (see effort-set optimistic update in `ThemeRiceBreakdownTable`).

### Styling
- Tailwind v4 (`@import "tailwindcss"`) + shadcn-installed components in
  `frontend/src/components/ui/`.
- All group / severity / MoSCoW / readiness / trend colors centralized in
  `frontend/src/lib/colors.ts`. **Never hardcode a feature-group color
  anywhere else** — use `groupColor(id).hex` etc.
- Dark mode is opt-in via the toggle in the sidebar footer. shadcn handles
  dark variants automatically via the `.dark` class on `<html>`.

### Naming
- Sheet column names use **Title Case With Spaces** (e.g. `Feature Group ID`).
  Match them exactly — `appendRows` is case-sensitive and won't normalize.
- TypeScript fields use snake_case for things that mirror sheet/JSON columns
  (e.g. `theme_id`, `feature_group_id`) and camelCase for derived JS-only
  state (e.g. `topRiceScore`).
- Feature group IDs (constants): `search_discovery`, `checkout_payment`,
  `delivery_tracking`, `returns_refunds`, `product_detail`,
  `prime_subscriptions`, `account_performance`. Plus the sentinel `all`
  for the cross-group view.

### Commits
- Conventional-ish style; descriptive subject line, body explains the
  why if non-trivial.
- Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Bundle doc updates (CONTEXT.md / DECISIONS.md / CLAUDE.md) into the
  same commit as the code change they describe.

---

## §14. Common gotchas + troubleshooting

### "404 on `/webhook/...`"
Cloud Run is on an older revision. Redeploy: `bash scripts/gcp-deploy.sh`
in Cloud Shell. Verify the new revision is live with
`gcloud run services describe amazon-discovery --region=asia-south1`.

### "Pipeline succeeds but Theme Breakdown JSON is blank in the sheet"
Header missing in row 1 of the Weekly Digests tab. Add the literal
string `Theme Breakdown JSON` to a new column in row 1. Re-run.

### "PERMISSION_DENIED" from Vertex AI
The runtime SA doesn't have `roles/aiplatform.user` on the Vertex project.
Cross-project IAM may have been needed at some point but the current
deploy uses the same project for both. Run:
```
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:n8n-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### "Gemini returned invalid JSON"
The model occasionally produces unparseable output despite the prompt.
The `parseJsonOrThrow` helper in `src/lib/gemini.ts` catches this and
includes the first 200 chars of the bad response in the error. Re-run
usually fixes it (LLM nondeterminism). If chronic, lower `temperature`
in the agent's call options.

### "Zero signals survived cleaning"
Agent 1 marked everything as duplicate/irrelevant. Possible causes:
- Mock fixture too repetitive — vary the texts more.
- The synthesize prompt's "Only mark duplicate: true on the LATER of two
  similar signals" instruction not being respected — temperature too high?

### "Gmail SMTP auth fails"
Gmail app passwords don't accept the spaces shown in the UI. Strip spaces
when setting `SMTP_PASS`. Make sure 2FA is enabled on the sending Gmail
account; without 2FA, app passwords can't be generated.

### "Render says CORS error"
`CORS_ORIGIN` is set to `*` by default. If you tightened it (e.g.,
`CORS_ORIGIN=https://foo.web.app`), the frontend's origin must match
exactly — no trailing slash, no protocol mismatch.

### "Effort selector clicks don't persist after reload"
Either the `Effort Estimates` headers are missing (see §9), or the
service is on an older revision without `/webhook/set-effort` (404 →
mutation errors, but the optimistic update may have masked it). Check
the network tab.

### "Pipeline takes longer than 120s"
The Cloud Run timeout is 120s. Symptoms: 504 to the client, but the
pipeline may still complete internally. Either bump the service timeout
(`--timeout=300` in `gcp-deploy.sh`) or split into ingest + analyse jobs
(see §15).

### "AI Studio API key auto-disabled by Google"
Don't use AI Studio keys. Use Vertex AI with ADC. The `gemini-api-key`
secret in Secret Manager is deprecated and can be deleted.

---

## §15. What's not built (yet)

These appear in `CONTEXT.md` §6 and are referenced from various components
as TODOs or placeholders. Don't be surprised when:

### RAG chat — BUILT (2026-06-02)
> Deep-dive: **`docs/RAG_CHAT.md`** (build & working narrative).
- `/chat` route + `POST /webhook/chat` (SSE), context-stuffing (no
  embeddings) of latest 3 digests + up to 200 signals scoped by
  group/week. See §6 for the endpoint, §7/§8 for the frontend.
- `streamGemini()` in `src/lib/gemini.ts`; `handleChatStream()` /
  `buildChatContext()` in `src/agents/chat.ts`; UI in
  `frontend/src/routes/ChatPage.tsx` + `components/chat/ChatMessage.tsx`.
- Citations: model emits `[signal <ID>]` with real `Signals.ID` values;
  the frontend badges any ID-shaped token (`YYYY-WNN-index`) — bracketed,
  `signal <ID>`, or bare — and resolves it to the signal text on hover.
- Session-only (no persisted history). Vertex calls are now 3 per pipeline
  run + 1 per chat turn.
- Still TODO: not yet on prod Cloud Run until this branch is deployed;
  vector RAG remains the upgrade path if the corpus outgrows the prompt.

### Live ingestion — BUILT (2026-06-02)
> Deep-dive: **`docs/LIVE_INGESTION.md`** (build & working narrative).
- `USE_MOCK=false` runs live ingestion in `src/pipeline/run.ts`. **All three
  sources run by default** (`ENABLE_APP_STORE` / `ENABLE_AMAZON_PLP` default
  true; set false to disable). Each fails soft → `[]` and is filtered for
  **substance** (`src/sources/substance.ts` — ≥25 chars & ≥5 words; Amazon also
  keeps `isPlatformRelevant`). Honest reality: App Store yields 0 from Cloud Run
  (Apple IP block) and Amazon PLP is usually thin — they're on per "use whatever
  is substantial", but Play Store is the dependable source. Results are deduped
  against `Seen Signal IDs`; `source_id`s committed ONLY after the Signals write.
  Per-source cap `INGEST_MAX_PER_SOURCE` (default 150; ~200 ceiling before
  AI-call batching). Throws if 0 new signals survive dedup. (Reddit planned —
  see `docs/LIVE_INGESTION.md` §9.)
- Source modules under `src/sources/`:
  - `appStore.ts` — iTunes Customer Reviews RSS, app `297606951`. Native
    entry id → `source_id`. Retry-on-empty + logs HTTP status/entry count.
    **Do NOT add a custom User-Agent/Accept header** — Apple returns an empty
    feed (HTTP 200, 0 entries) for those; plain fetch works. Tries `['in','us']`
    (Apple's RSS serves only a country-matching IP). **KNOWN LIMITATION: BOTH
    stores return 0 from the Cloud Run IP — Apple blocks the Google datacenter
    range outright.** App Store yields 0 in prod; works from a non-datacenter IP
    (local). iOS reviews in prod need a proxy / residential egress / 3rd-party
    API. Play Store covers app reviews meanwhile.
  - `playStore.ts` — `google-play-scraper` for
    `com.amazon.mShop.android.shopping`. reviewId → `source_id`.
  - `amazon.ts` — Jina Reader on `/dp/<ASIN>` pages (the `/product-reviews/`
    path is sign-in-walled). Reads ASINs from the `Watch Listings` tab.
    `parseAmazonReviews()` handles US + IN/UK date layouts. permalink review
    id → `source_id`, else a content hash. **`isPlatformRelevant()` filters
    out product-opinion noise** — keeps only ≤3★ reviews or non-5★ reviews
    naming a platform/listing problem (counterfeit, damaged, wrong item,
    return/refund, seller, etc.). NOTE: low/intermittent yield — `/dp/` top
    reviews skew positive, and Amazon sometimes serves Jina a CAPTCHA; the
    source fails soft to `[]`. The real problem reviews (1-2★) are behind the
    sign-in wall Jina can't pass.
  - `dedupe.ts` — `loadSeenIds` / `filterUnseen` / `commitSeenIds`.
- Manual prerequisite: the `Seen Signal IDs` and `Watch Listings` tabs must
  exist (see §9). Missing tabs fail open (App/Play still ingest; Amazon skips).
- Still reserved/unused: the `Jina Cache` tab (caching Jina responses is a
  future optimization). Region/country is hardcoded `us` for App/Play; the
  Amazon source honors per-ASIN marketplace from the Watch Listings tab.

### Pipeline split (deferred)
- Currently a single ~30-50s job. If live ingestion pushes past Cloud
  Run's 120s timeout, split into:
  - `POST /webhook/ingest` — fetches reviews, dedups, writes raw rows to
    a new `Raw Signals` tab.
  - `POST /webhook/analyse` — reads raw, runs Gemini stages, writes
    Weekly Digests + sends emails.
- Until that's a measured problem, single-job stays.

### Authentication
- All endpoints are publicly invokable (`--allow-unauthenticated`).
- Plan options: Firebase Auth on the frontend + ID-token verification on
  the backend, OR a simple API key middleware, OR IAP. Not decided.

### Multi-PM regression routing
- Regression alert email goes to a single recipient.
- Plan if needed: a `feature_group_id → PM email` map (env or sheet tab),
  fan out one email per affected group's PM.

### Frontend hosting (Vercel / Netlify)
- Static Vite SPA hosted on **Vercel or Netlify** (chosen over Firebase —
  user is fluent in them; better DX for a Vite SPA). Connect the GitHub repo,
  root dir `frontend`, build `npm run build`, output `dist`.
- `frontend/.env.production` points the prod build at the Cloud Run backend;
  `frontend/vercel.json` + `frontend/public/_redirects` handle SPA routing.
- CORS defaults to `*` (works out of the box); lock to the hosted origin via
  `CORS_ORIGIN=… bash scripts/gcp-deploy.sh` once the URL is known.

---

## §16. How-to recipes for common operations

### Add a new pipeline stage
1. Create `src/pipeline/<stage>.ts` with a pure function `function stage(input): output`.
2. Import + call it in `src/pipeline/run.ts` between the right two stages.
3. If it adds data to a signal/theme, extend the type in `src/types.ts`.
4. Decide if the data needs to persist:
   - To `Signals` tab — extend `formatSignalsForSheet` in `src/pipeline/format.ts`. Tell user to add the header.
   - To `Weekly Digests` tab — extend `formatDigestRow`. Tell user to add the header.
5. Typecheck. Commit (update docs per §3).

### Add a new endpoint
1. Add the handler in `src/server.ts`. Follow the existing pattern (`try/catch`, JSON body validation, response shape).
2. Add a typed fetcher in `frontend/src/lib/api.ts`.
3. Update `§6 API surface` in this file with request/response shapes.
4. Update `CONTEXT.md` §4 architecture diagram if it's user-facing.
5. If the endpoint reads/writes a new sheet column, see "Add a new sheet column."
6. Test locally first (`npm run dev` + curl), then redeploy.

### Add a new sheet column
1. Update the backend writer (`format.ts` or wherever the row is built) to include the new key.
2. **Tell the user to add the column header to row 1 of the appropriate tab.** The `appendRows` helper aligns by header — without it, writes silently drop.
3. If the column is read by the frontend, update `parseDigestRow` (or equivalent) in `frontend/src/lib/parsers.ts`.
4. Update `§9 Sheet schema` in this file.

### Add a new feature group
1. Add to `src/config/featureGroups.ts` (id, name, keywords).
2. Update `valid_ids` in the same file.
3. Update `FEATURE_GROUP_NAMES` in `frontend/src/lib/parsers.ts`.
4. Pick a color and add to `GROUP_COLORS` in `frontend/src/lib/colors.ts`.
5. The Sidebar `NAV_TARGETS` will auto-pick up new groups from `FEATURE_GROUP_NAMES`.

### Add a new frontend page
1. Create `frontend/src/routes/NewPage.tsx`.
2. Wire into `frontend/src/App.tsx` routes.
3. Add to TopBar's `PAGES` array if it should appear as a page-tab.
4. Use `useActiveGroup()` + `useActiveWeek()` to respect URL state.
5. Use `useQuery` for any data fetching; key by route + params for cache hygiene.

### Tighten CORS to a specific origin
```
# In Cloud Shell
CORS_ORIGIN=https://your-frontend.web.app bash scripts/gcp-deploy.sh
```

### Rotate the SMTP password
1. Generate a new app password at https://myaccount.google.com/apppasswords
2. In Cloud Shell:
   ```
   printf '<new-password-no-spaces>' | gcloud secrets versions add smtp-pass --data-file=-
   ```
3. Force a new Cloud Run revision so it picks up the new secret version:
   ```
   gcloud run services update amazon-discovery --region=asia-south1 \
     --update-labels=secret-rotated=$(date +%s)
   ```

### Trigger a fresh pipeline run from anywhere
- Frontend: click "Run pipeline" in the top bar (any page).
- Cloud Shell: `curl -X POST "$SERVICE_URL/webhook/run-pipeline" -H 'Content-Type: application/json' -d '{"recipient_email":"…"}'`
- Cloud Scheduler: console → Cloud Scheduler → `amazon-discovery-monthly` → "Force Run."

---

## §17. File-by-file map (backend `src/`)

| File | What it does |
|---|---|
| `server.ts` | Express app, all HTTP endpoints. Boots in §11's `dev` script. |
| `cli.ts` | Runs the pipeline once via stdin args (no HTTP). Useful for local testing. |
| `types.ts` | Shared types: `RawSignal`, `CleanedSignal`, `TaggedSignal`, `Theme`, `ScoredTheme`, `ScoredGroup`, `Delta`, `Meta`, `ReadinessResult`, `PipelineResult`, etc. |
| `config/env.ts` | zod-validated env loader. Single source of truth for env vars. |
| `config/featureGroups.ts` | The 7 feature groups (id, name, keywords). Used by the synthesize prompt. |
| `lib/gemini.ts` | `callGemini(prompt, opts)` — Vertex AI REST call with cached `GoogleAuth`. `parseJsonOrThrow` helper. `streamGemini(prompt, opts)` — async generator over `:streamGenerateContent?alt=sse`, text (not JSON) output, for chat. |
| `lib/sheets.ts` | `appendRows(tab, rows)` + `readRows(tab)`. Uses ADC via `googleapis`. |
| `lib/email.ts` | `sendEmail({ to, subject, html })` — Nodemailer over SMTP. |
| `sources/mockSignals.ts` | Loads `data/signals.json`. Used when `USE_MOCK=true`. |
| `sources/appStore.ts` | Live: iTunes Customer Reviews RSS (app 297606951) → RawSignal[]. Fails soft. |
| `sources/playStore.ts` | Live: google-play-scraper reviews for the Amazon app → RawSignal[]. `hasSubstance` filter drops short/low-detail reviews; over-fetches (limit×2) to keep volume. Fails soft. |
| `sources/amazon.ts` | Live: Jina Reader on /dp/<ASIN> pages from the Watch Listings tab. `parseAmazonReviews()` parses the markdown. Fails soft. |
| `sources/dedupe.ts` | Cross-run dedup vs the Seen Signal IDs tab (loadSeenIds/filterUnseen/commitSeenIds). |
| `sources/substance.ts` | `hasSubstance(text)` — shared length/word-count filter applied by all three sources. |
| `pipeline/run.ts` | The orchestrator. Wires every stage in order, fires regression email in parallel. |
| `pipeline/normalize.ts` | Validates raw signals, computes weekId + dataQualityWarning. |
| `pipeline/regression.ts` | Detects ≥5-signal version clusters. |
| `pipeline/aggregate.ts` | Buckets tagged signals by feature group + theme. |
| `pipeline/rice.ts` | RICE formula + percentile MoSCoW + deterministic theme readiness. |
| `pipeline/wow.ts` | Week-over-week delta computation. |
| `pipeline/format.ts` | Row-shaping helpers for `appendRows`. |
| `agents/clean.ts` | Agent 1: dedup + irrelevance + severity + version_flagged. Gemini call. |
| `agents/synthesize.ts` | Agent 3: theme clustering + feature-group tagging. Gemini call. |
| `agents/chat.ts` | RAG chat (Track 1): `buildChatContext()` scopes 3 digests + 200 signals by group/week; `handleChatStream()` builds the prompt and streams via `streamGemini`. |
| `agents/readiness.ts` | Agent 5: discovery readiness assessment for top group. Gemini call. |
| `templates/digestEmail.ts` | Full digest HTML with 👍/👎 anchors. Receives `baseUrl` + `recipientEmail`. |
| `templates/regressionEmail.ts` | Regression alert HTML. |

---

## §18. Project state at a glance (as of last update)

- Code on `master`: includes per-group DigestPage rebuild, schema-aware Effort/Feedback writes, CONTEXT.md + DECISIONS.md + CLAUDE.md.
- Cloud Run revision: may be older than `master` — verify before assuming a new endpoint exists in prod.
- Sheet headers: should now include `Trend Direction JSON` + `Theme Breakdown JSON` on Weekly Digests; verify with the user before running.
- Frontend: static Vite build, hosted on Vercel/Netlify (config in repo; connect the repo to deploy). Was local-dev-only before 2026-06-02.
- RAG chat: decided, not built.
- Live ingestion: decided (scope = Amazon platform quality, all 3 sources), not built.

**When in doubt about what's current, ask the user before assuming.**
The code is the truth; the docs are best-effort.

---

*Last updated: 2026-06-01 (when this rewrite landed).*
