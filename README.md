# Amazon Discovery Intelligence

Customer-signal analysis pipeline ported from an n8n workflow into a TypeScript codebase.

The pipeline ingests customer reviews, runs 3 Gemini calls (clean → synthesize → readiness), writes results to Google Sheets, and emails a styled HTML digest. It can be triggered via HTTP webhook or a monthly cron.

## Project layout

```
src/
  server.ts            # Express + node-cron entrypoint
  cli.ts               # one-off run (npm run run:once)
  pipeline/
    run.ts             # orchestrator
    normalize.ts       # schema validation + weekId + dataQualityWarning
    regression.ts      # version-cluster regression detection
    aggregate.ts       # bucketize signals by feature group + theme
    rice.ts            # RICE scoring + percentile MoSCoW
    wow.ts             # week-over-week deltas
    format.ts          # column shaping for sheets
  agents/
    clean.ts           # Gemini call #1
    synthesize.ts      # Gemini call #2
    readiness.ts       # Gemini call #3
  lib/
    gemini.ts          # REST client for Gemini
    sheets.ts          # googleapis Sheets wrapper
    email.ts           # Nodemailer SMTP wrapper
  templates/
    digestEmail.ts     # weekly digest HTML
    regressionEmail.ts # urgent regression alert HTML
  config/
    env.ts             # zod-validated env loader
    featureGroups.ts   # the 7 feature-group taxonomy
  sources/
    mockSignals.ts     # loads data/signals.json
data/
  signals.json         # 20-row fixture (extracted from n8n's Mock Signals node)
```

## Setup

1. `npm install`
2. Copy `.env.example` → `.env` and fill in:
   - `GEMINI_API_KEY` — from Google AI Studio
   - `GOOGLE_APPLICATION_CREDENTIALS` — path to a service-account JSON file with access to the Google Sheet
   - `SMTP_PASS` — Gmail app password (no spaces)
3. Place your service-account JSON at the path you set in `GOOGLE_APPLICATION_CREDENTIALS` (default: `./gcp-service-account.json`). Make sure the service-account email has edit access to the sheet (`SHEETS_DOCUMENT_ID`).
4. The Google Sheet must already have two tabs with headers:
   - **Signals**: `ID, Text, Source, Date, Rating, Severity Score, Feature Group ID, Theme ID, Theme Label, Week ID, App Version, Version Flagged, Created At`
   - **Weekly Digests**: `Week ID, Feature Group ID, Top Theme, Signal Count, Avg Severity, Trend Direction, Top RICE Score, Top MoSCoW, RICE Scores JSON, MoSCoW JSON, Discovery Readiness JSON, Overall Group Readiness, Themes Ready Count, Themes Blocked Count, Data Quality Warning, WoW Delta JSON, Created At`

## Running

```bash
# Dev mode (auto-reloads, runs server + cron)
npm run dev

# Production
npm run build && npm start

# One-off run from CLI (no server, no cron)
npm run run:once -- you@example.com

# Type-check only
npm run typecheck
```

## Triggering manually

```bash
curl -X POST http://localhost:3000/run-pipeline \
  -H 'Content-Type: application/json' \
  -d '{"recipient_email":"you@example.com"}'
```

If `recipient_email` is omitted, the pipeline uses `DEFAULT_RECIPIENT` from `.env`.

## Cron

`CRON_SCHEDULE` is a standard 5-field cron string. Default `0 9 1 * *` = 09:00 on the 1st of each month. Uses `node-cron` (server-time, not UTC unless your server is UTC). Set `DEFAULT_RECIPIENT` for the cron job to know who to send to.

## How the pipeline thinks (1-paragraph version)

20 mock reviews → strip too-short / invalid rows + compute weekId + flag low-volume runs → Gemini dedups and assigns each signal a severity score 1–5 and a `version_flagged` boolean → if ≥5 version-flagged signals share an app-version string, fire a regression alert email → Gemini clusters signals into themes and tags each with one of 7 feature groups → signals are appended to the Signals sheet → last week's digest row is read for WoW comparison → each feature group gets a RICE score `(reach × severity × confidence × version-mult) / effort × trend-mult` → percentile-based MoSCoW → Gemini judges the top group's themes against 4 evidence-quality criteria → digest row is appended to Weekly Digests sheet → HTML email is sent.

## Mock-only ingestion

`USE_MOCK=true` (the default) loads `data/signals.json`. The live App Store / Play Store / Amazon scraping path is not implemented — when you have a real dataset, drop it into `data/signals.json` matching the same shape (`text, source, date, rating, severity_raw, app_version`).

## Migrating credentials from n8n

| n8n credential | What you need in `.env` |
|---|---|
| "Gemini API" (header auth) | `GEMINI_API_KEY` — get a fresh one from https://aistudio.google.com/apikey |
| "Ritika Das Google Service Account account" | A service-account JSON file; place at `GOOGLE_APPLICATION_CREDENTIALS` path. The service-account email must have edit access to the Sheet. |
| "Gmail account" (OAuth2) | Skipped — use a Gmail app password instead (`SMTP_PASS`). Generate one at https://myaccount.google.com/apppasswords after enabling 2FA. |
| "RSMTP account" | Same as above — use `SMTP_PASS`. |

## Frontend

A React + Vite + shadcn dashboard lives in `frontend/`. It consumes the Cloud Run API and renders three pages:
- **Dashboard** (`/`) — latest pipeline run: KPI strip, feature-group RICE rankings chart, discovery readiness assessment
- **History** (`/history`) — table of past weekly runs
- **Week detail** (`/week/:weekId`) — overview tab (same as dashboard) + Signals tab with client-side filters

The top bar has a **Run pipeline** button that opens a confirm dialog → simulated-progress stepper while the backend works (~30s) → toast + automatic data refresh on completion.

### Dev

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

By default the frontend talks to the production Cloud Run URL. To point it at a local backend during development, create `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:3000
```

### Build & deploy (Vercel or Netlify)

The SPA is a static Vite build hosted on **Vercel or Netlify** (connect the
GitHub repo, no separate deploy command needed). Settings:
- **Root directory:** `frontend`
- **Build command:** `npm run build`  →  **Output directory:** `dist`
- **API URL:** `frontend/.env.production` already points the build at the prod
  Cloud Run backend, so no dashboard env var is required (override with
  `VITE_API_BASE_URL` if needed).
- **SPA routing:** `frontend/vercel.json` (Vercel) and `frontend/public/_redirects`
  (Netlify) both rewrite all routes to `index.html` — already in the repo.

Local one-off build: `cd frontend && npm run build` → `frontend/dist/`.

CORS: the backend defaults to `CORS_ORIGIN=*`, so the hosted origin works
out of the box. To lock it down after you know the URL:
```bash
CORS_ORIGIN=https://your-app.vercel.app bash scripts/gcp-deploy.sh
```

### Stack

| Layer | Choice |
|---|---|
| Build | Vite + TypeScript |
| UI | shadcn/ui on Tailwind v4 |
| Routing | React Router v6 |
| Data | TanStack Query (react-query) |
| Charts | Recharts (via shadcn's chart wrapper) |
| Icons | lucide-react |
| Toasts | Sonner (via shadcn) |

## Deploying to GCP (Cloud Run)

Two scripts in `scripts/` do the whole setup. Run order:

**1. Push your code somewhere Cloud Shell can reach it.** Either:
- `git init && git remote add origin <your-github> && git push -u origin main` (then `git clone` it inside Cloud Shell), OR
- Click "Upload File" in Cloud Shell and upload the project as a `.zip`

**2. In Cloud Shell, from the project root:**
```bash
# One-time infra setup: decommissions n8n stack, enables APIs, creates secrets
bash scripts/gcp-infra.sh

# Build + deploy + create the monthly scheduler job
bash scripts/gcp-deploy.sh
```

**3. Share the Google Sheet with `n8n-sa@<your-project>.iam.gserviceaccount.com` as Editor.** (One-time, from the Sheets UI.)

**4. Test:**
```bash
curl $SERVICE_URL/health
curl -X POST $SERVICE_URL/run-pipeline -H 'Content-Type: application/json' \
  -d '{"recipient_email":"ritikadas98@gmail.com"}'
```

**Re-deploying after code changes:** just re-run `bash scripts/gcp-deploy.sh` — Cloud Build rebuilds the image and Cloud Run rolls out a new revision.

### API endpoints (for the future frontend)

| Method | Path | What |
|---|---|---|
| GET  | `/health` | liveness check |
| POST | `/run-pipeline` | trigger the full pipeline; body `{recipient_email}` (optional, falls back to env) |
| GET  | `/digests?limit=N` | last N rows from "Weekly Digests" (most recent first) |
| GET  | `/signals?week=YYYY-WNN&limit=N` | signals filtered by Week ID |
| GET  | `/runs/latest` | most recent digest row as JSON |

CORS is controlled by `CORS_ORIGIN` env var on the Cloud Run service. Default `*` — once you have a frontend origin, set it to that specific URL.

### Cost (steady state)

~₹40/mo (Cloud Run free-tier covers ≤200 invocations of ~30s each; Cloud Scheduler 3 jobs free; minimal Secret Manager + Artifact Registry storage). $300 credits = ~50 years.

## Troubleshooting

- **`Zero signals survived cleaning`** — Gemini marked everything as duplicate/irrelevant. Inspect the prompt in `src/agents/clean.ts` and the raw fixture.
- **`Gemini API error (429)`** — rate limit. Add a delay or switch model.
- **`Sheet tab "..." has no header row`** — manually add the headers listed in the Setup section.
- **`Authentication failed` (SMTP)** — Gmail app passwords don't accept the spaces shown in the UI; paste it without spaces. Make sure 2FA is on for the sending account.
- **Sheet writes silently appending to wrong tab** — double-check `SHEETS_SIGNALS_TAB` / `SHEETS_DIGESTS_TAB` env values match the tab names exactly (case-sensitive).
