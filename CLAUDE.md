# CLAUDE.md

Instructions for Claude Code (and any AI assistant) working in this repo.
Auto-loaded on every session. Keep this terse and reference-shaped — narrative
lives in `CONTEXT.md`, rationale lives in `DECISIONS.md`.

## What this project is

Customer-signal analysis pipeline for Amazon (app UX + platform/product
quality). Ingests reviews, runs 3 Gemini calls (clean → synthesize →
readiness), writes to Google Sheets, emails a weekly digest, and feeds a
React dashboard. Hosted on Cloud Run; storage is Google Sheets.

## Read first

When starting a fresh session in this repo, read these in order:
1. `CONTEXT.md` — current state + what's planned + open dilemmas
2. `DECISIONS.md` — per-decision log with PM rationale (read top entries)
3. This file — for commands + conventions

## Hard rules (do not violate)

- **Every material change updates both `CONTEXT.md` and `DECISIONS.md` in
  the same commit.** This is the project default — not "ask before doing,"
  it's "always do." Material = new component, new endpoint, schema change,
  scope shift, decision to not do something we discussed, a dilemma
  resolved. Skip only for typo fixes, dep bumps, throwaway exploration.
  - `DECISIONS.md`: append new entry at the top with 4 sections —
    What changed / PM rationale / Mechanics / Considered & not done.
  - `CONTEXT.md`: edit affected sections in place (do not append-only).
- **Never amend commits.** Always make a new commit.
- **Never `git push --force` to master.** Warn the user if they ask for it.
- **Preserve the "Recieved At" header misspelling** on the Feedback sheet —
  it's the existing column header; code must match it as-is.
- **`appendRows` aligns by header name, not column position.** When you add
  a new sheet column in code, the user adds the header to row 1 of the
  appropriate tab manually.

## Key commands

### Backend (repo root)
```
npm install              # one time
npm run typecheck        # tsc --noEmit
npm run build            # tsc → dist/
npm run dev              # tsx watch src/server.ts
npm run run:once         # one-shot CLI invocation of the pipeline
npm start                # node dist/server.js (after build)
```

### Frontend (`frontend/`)
```
cd frontend
npm install
npm run dev              # Vite dev server, localhost:5173
npm run build            # tsc -b && vite build → frontend/dist/
npx tsc -b --noEmit      # typecheck only
```

### GCP (run in Cloud Shell, not locally — user's gcloud is auth'd there)
```
bash scripts/gcp-infra.sh    # one-time / idempotent infra setup
bash scripts/gcp-deploy.sh   # redeploys backend, also updates PUBLIC_BASE_URL
```

## Architecture pointers

- Backend: `src/` — Express server, pipeline stages, Gemini agents, Sheets
  + email libs, HTML templates. Single-job pipeline today.
- Frontend: `frontend/src/` — Vite + React + shadcn/ui + Tailwind v4 +
  TanStack Query + Recharts + React Router.
- Mock data: `data/signals.json` (140 signals — `USE_MOCK=true` toggle in
  env). Live ingestion not implemented yet.
- Storage: a single Google Sheet with tabs: Signals, Weekly Digests,
  Effort Estimates, Feedback, Jina Cache. Service account `n8n-sa@…` has
  edit access.

## Sheet schema (frequently needed — keep this section accurate)

| Tab | Headers (row 1) |
|---|---|
| Signals | `ID, Text, Source, Date, Rating, Severity Score, Feature Group ID, Theme ID, Theme Label, Week ID, App Version, Version Flagged, Created At` |
| Weekly Digests | `Week ID, Feature Group ID, Top Theme, Signal Count, Avg Severity, Trend Direction, Top RICE Score, Top MoSCoW, RICE Scores JSON, MoSCoW JSON, Discovery Readiness JSON, Overall Group Readiness, Themes Ready Count, Themes Blocked Count, Data Quality Warning, WoW Delta JSON, Created At, Trend Direction JSON, Theme Breakdown JSON` |
| Effort Estimates | `Theme ID, Feature Group ID, Week ID, Effort Value, Set By, Set At` |
| Feedback | `Week ID, Feature Group ID, PM Email, Rating, Recieved At` (the "Recieved" misspelling is intentional) |
| Jina Cache | (reserved for future Amazon product review scraping) |

## Conventions

- TypeScript on both sides. `strict: true`. ESM modules. `@/*` path
  alias on frontend → `frontend/src/*`.
- React: function components only, hooks-first, react-query for all server
  state, no global state library (URL + react-query is the state model).
- Styling: Tailwind v4 + shadcn/ui components from `frontend/src/components/ui/`.
  Group/severity/MoSCoW/readiness colors are centralized in
  `frontend/src/lib/colors.ts`.
- Backend env loaded via zod-validated `src/config/env.ts`. Add new env vars
  there with defaults when sensible.
- Auth: Vertex AI + Sheets both use ADC via the Cloud Run runtime SA in
  prod, or a service-account JSON locally (via `GOOGLE_APPLICATION_CREDENTIALS`).
  No API keys for these services. SMTP password is in Secret Manager.

## Gotchas (things that have bitten us)

- **Cloud Run is on an older revision unless freshly deployed.** New
  endpoints like `/webhook/*` won't exist until `bash scripts/gcp-deploy.sh`
  runs. A 404 on `/webhook/...` means "redeploy needed."
- **`appendRows` silently drops keys that don't have a matching sheet
  header.** If a new column doesn't show data after a fresh run, check
  that the header exists in row 1 of the target tab.
- **Gemini's `gemini-3.1-flash-lite-preview` was shut down 25 May 2026.**
  Use `gemini-2.5-flash` (default in env) or `gemini-flash-latest`.
- **Vertex AI requires the runtime SA to have `roles/aiplatform.user` on
  the Vertex project**, not the Cloud Run project. `scripts/gcp-infra.sh`
  handles this — defaults to same project as Cloud Run.
- **Theme IDs (`t1`, `t2`, ...) are Gemini-generated per run** and not
  stable across weeks. Effort overrides are keyed by `(theme_id, week_id)`
  for this reason.
- **AI Studio API keys get auto-disabled by Google's leak scanners** if
  they appear in chat transcripts, GitHub pastes, etc. Vertex AI + ADC
  avoids this whole class of incident.

## When asked to do something destructive

Confirm with the user before:
- Force-pushing
- `rm -rf` on anything outside `node_modules`, `dist`, `.tmp`
- Deleting sheet tabs / rows
- Renaming the default branch
- Removing files that aren't obviously transient

## Useful files at a glance

- `src/pipeline/run.ts` — orchestrator; the canonical order of pipeline stages
- `src/lib/gemini.ts` — Vertex AI client (`callGemini`)
- `src/lib/sheets.ts` — `appendRows` + `readRows` helpers
- `src/templates/digestEmail.ts` — digest HTML, including 👍/👎 feedback anchors
- `frontend/src/routes/{DigestPage,SignalsPage,ReportPage}.tsx` — the 3 user-facing pages
- `frontend/src/lib/{api.ts,colors.ts,parsers.ts,url-state.ts}` — shared frontend plumbing
- `scripts/gcp-infra.sh` + `scripts/gcp-deploy.sh` — infra + deploy
