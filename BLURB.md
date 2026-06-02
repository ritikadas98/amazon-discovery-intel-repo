# Amazon Discovery Intelligence

**What it is.** A pipeline that turns raw customer reviews of the Amazon Shopping
app into a weekly, RICE-prioritized product-discovery digest, for product
managers (a Lead PM's cross-cutting view and feature PMs who each own a slice
like Returns or Checkout).

**The non-obvious problem.** PMs don't lack customer signal, they drown in it.
The hard part isn't collecting reviews, it's knowing what to prioritize and
whether there's enough evidence to act. A second non-obvious finding: "platform
quality" complaints live in app-store reviews and forums (Reddit), not in
product-listing reviews, which are about the product, not Amazon. So the source
you reach for matters as much as the analysis.

**What I built / decided.** A deployed pipeline: ingest (live Play Store reviews
plus a curated fixture) to two Gemini stages (clean, then cluster into themes) to
RICE scoring, percentile MoSCoW, and a discovery-readiness rubric, written to a
Google Sheet and surfaced as an email digest, a React dashboard, and a RAG chat
with citations. The hard tradeoff: I kept the curated "Sample" data and real
"Live" data strictly separate behind a toggle, and refused to pad thin live data
with the fixture, because blending would have masked the real week-over-week
movement the tool exists to surface. A richer-looking demo was not worth a lying
trend line.

**Status.** Working end to end and deployed (backend on Cloud Run, monthly cron;
frontend runs locally, Vercel/Netlify-ready). Live ingestion is Play-Store-strong
today; App Store is blocked from datacenter IPs and Amazon listing reviews are
thin, both documented honestly. Stage: done / demo-ready, with a clear roadmap
(Reddit source, a paid reviews API for iOS and critical reviews, auth).

Repo: https://github.com/ritikadas98/amazon-discovery-intel-repo
