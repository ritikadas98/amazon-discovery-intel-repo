# Project checklist & demo runbook

Amazon Discovery Intelligence — current state, what's left, and how to demo it.
Last updated 2026-06-02.

---

## A. Built & shipped (all on `master` / GitHub)

**Pipeline (backend, Cloud Run, monthly cron)**
- [x] 6-stage pipeline: ingest → normalize → Gemini clean → regression detect →
      Gemini synthesize → aggregate → RICE → MoSCoW → WoW → readiness → Sheets + email
- [x] RICE + percentile MoSCoW + discovery-readiness rubric
- [x] Clean/synthesize use a 32768-token budget + retry (no more "invalid JSON"
      truncation on ~140+ signals)

**Live ingestion (Track 2)**
- [x] Play Store source (reliable, ~150/run, substance-filtered)
- [x] App Store source (works locally; **0 from Cloud Run** — Apple IP block)
- [x] Amazon PLP source via Jina (thin: positive top-reviews + CAPTCHAs)
- [x] Shared substance filter (≥25 chars & ≥5 words) on all sources
- [x] Cross-run dedup (`Seen Signal IDs` tab, commit-after-write)
- [x] Per-source flags (`ENABLE_APP_STORE` / `ENABLE_AMAZON_PLP`, default on)

**RAG chat (Track 1)**
- [x] `POST /webhook/chat` (SSE) + `/chat` page, floating chat FAB on every page
- [x] `[signal <ID>]` citations with hover tooltips

**Sample/Live data-source feature**
- [x] `Data Source` tag (Sample/Live) on every run
- [x] Top-bar toggle + provenance badge + hover explanations
- [x] Whole dashboard filters by source (Digest, Report, Signals, Sidebar, trend)
- [x] "Run pipeline" follows the toggle (Sample → mock, Live → live)
- [x] Chat respects the source
- [x] WoW is source-isolated (Live vs Live, Sample vs Sample)

**Frontend polish**
- [x] Sticky layout, theme toggle in top bar, tab logo + title
- [x] Week-selector dedupe, readable (richColors) error toasts

**Docs**
- [x] CLAUDE.md / CONTEXT.md / DECISIONS.md kept current
- [x] docs/RAG_CHAT.md, docs/LIVE_INGESTION.md, this checklist

---

## B. To get demo-ready (your actions)

- [ ] **Final backend redeploy** — bundles the truncation fix + chat-source +
      WoW-source-aware: `cd ~/amazon-discovery-intel-repo && git pull && bash scripts/gcp-deploy.sh`
- [x] Sheet headers: `Data Source` on Weekly Digests + Signals; `Seen Signal IDs`
      + `Watch Listings` tabs exist (confirmed — your Sample run tagged correctly)
- [x] **Sample run** seeded (a `Sample`-tagged Week-23 digest exists)
- [ ] **Live run** — toggle to *Live data* → Run → populates the Live side
- [ ] (Optional) **Host the frontend** on Vercel/Netlify for a shareable URL
      (root dir `frontend`, build `npm run build`, output `dist`; config already in repo)
- [ ] (Optional) Revoke the local cross-project Vertex IAM grant (dev-only)

---

## C. Demo-day runbook (~6-7 min)

1. **Hook** — the problem: PMs drown in customer signal; the hard part is
   prioritizing. This turns raw signal into a weekly prioritized discovery digest.
2. **Analysis on Sample** (toggle → *Sample data*): hero theme → RICE ranking
   (explain your weights) → MoSCoW → discovery readiness → drill into a group →
   Report page (edit effort → PM-adjusted RICE recomputes live) → Chat (ask a
   question, show `[signal]` citations).
3. **"It's real"** (toggle → *Live data*): same dashboard on real Play Store
   reviews; note the Source-Mix chart differs (Sample = all channels, Live =
   Android-heavy). Mention the monthly cron + email digest.
4. **Judgment beat** (the differentiator): "live is Android-heavy — Apple blocks
   our server IP, and product-listing reviews are product-opinion not platform
   signal, so I lead with Play Store. I deliberately keep Sample and Live
   separate — they never blend, anywhere — so real week-over-week movement isn't
   masked." Point at the toggle/badge.
5. **Roadmap**: Reddit (where platform complaints live), a paid reviews API to
   unblock iOS + critical reviews, vector RAG when the corpus grows.

Tips: land on Sample for the rich first impression; **don't trigger a live run
on stage** (cold start + variability) — pre-run it; each reviewer run costs a
little Gemini + writes rows + emails.

---

## D. Known limitations (own them in the demo)

- App Store = 0 from Cloud Run (Apple datacenter-IP block; works locally).
- Amazon PLP is thin (top-reviews skew positive; CAPTCHAs; critical reviews are
  login-walled). Best-effort.
- WoW needs ≥2 same-source runs to show deltas; first run of each source is a
  clean baseline (no deltas) by design.
- Sample fixture is static (140 signals); it shows analysis quality, not change.
- Frontend not yet hosted (local dev / screenshare until Vercel/Netlify).
- All endpoints publicly invokable (no auth yet).

---

## E. Reference

- Repo: `github.com/ritikadas98/amazon-discovery-intel-repo`
- Backend (prod): `https://amazon-discovery-34n34tq6za-el.a.run.app`
- Sheet: `1onm967wGWmy2YpwNJxr_UEDkFGb8Ibx22unKLXuKj3g`
- Redeploy: `bash scripts/gcp-deploy.sh` (Cloud Shell)
- Trigger a run: `curl -X POST "$SERVICE_URL/webhook/run-pipeline" -H 'Content-Type: application/json' -d '{"recipient_email":"…","use_mock":false}'`
- Tail logs: `gcloud run services logs read amazon-discovery --region=asia-south1 --limit=50`
- Local dev: backend `npm run dev`; frontend `cd frontend && npm run dev`

---

## F. Smoke test — verify everything works

Do the **final redeploy + one Live run** first, so both sources have data.

**Backend**
- [ ] `curl $SERVICE_URL/health` → `{"status":"ok",…}`
- [ ] `curl '$SERVICE_URL/digests?limit=3'` → returns rows
- [ ] `gcloud scheduler jobs describe amazon-discovery-monthly --location=asia-south1` → `state: ENABLED` + next run date

**Run pipeline (both modes)**
- [ ] Toggle **Sample** → Run pipeline → dialog reads "Run on Sample data" → completes, success toast, **email arrives**
- [ ] Toggle **Live** → Run → "Run on Live data" → completes
- [ ] Logs show `source=Sample/Live`, `Cleaned: N`, `Synthesized`, `Appended N rows`, **no "invalid JSON"**
- [ ] Sheet: new Signals + Weekly Digests rows carry `Data Source` = Sample/Live

**Toggle + badge**
- [ ] Sample → violet "Sample data" badge; Live → green "Live data … pulled <date>" badge
- [ ] Sidebar counts + total change when you flip the toggle
- [ ] Hover each toggle button → explanation tooltip

**Digest page**
- [ ] All Groups: hero theme, Feature Group Ranking (RICE/MoSCoW/Δ/trend), readiness alert, data-quality banner, 7-day sparkline
- [ ] Click a group → theme cards (R/I/C/E + RICE + MoSCoW), top signals, **Source Mix chart** (Sample = app/play/amazon mix; Live = Play-heavy), RICE trend

**Signals page**
- [ ] Table loads; search / source-channel / severity filters, sort, pagination, row-expand all work
- [ ] Reflects active group + week + Sample/Live

**Report page**
- [ ] Pick a group → readiness summary + Theme RICE breakdown
- [ ] Click an effort segment (XS/S/M/L/XL) → PM-adjusted RICE updates instantly
- [ ] Reload → effort persists (saved to Effort Estimates tab)
- [ ] Evidence-gap cards + next-steps render

**Chat**
- [ ] Chat FAB on every page → opens `/chat`
- [ ] Header reads "Chatting over <group> · week … · Sample/Live data"
- [ ] Ask a question → streams; cites `[signal …]` as badges; hover a badge → signal text
- [ ] Flip source → answer scopes to that source only

**Email / feedback**
- [ ] Digest email received (styled, themes, 👍/👎 buttons)
- [ ] Click 👍/👎 → "recorded ✓" page → row appears in the Feedback tab
- [ ] (If a ≥5 same-version cluster exists) regression-alert email arrives

**Cross-cutting**
- [ ] Dark-mode toggle (top bar) works
- [ ] group / week / source persist in the URL across pages
- [ ] Week selector shows one entry per week (no dupes)

**WoW (needs 2+ runs of the same source)**
- [ ] First run of a source → **no deltas** (clean baseline) — correct
- [ ] Second same-source run → deltas appear (Δ column + MoSCoW escalation badges)
