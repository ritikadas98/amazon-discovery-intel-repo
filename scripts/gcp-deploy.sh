#!/usr/bin/env bash
# Build and deploy amazon-discovery to Cloud Run.
# Run from the project root (where Dockerfile lives) — either in Cloud Shell
# (after uploading/cloning the repo) or locally if you have gcloud authenticated.
#
# Uses `gcloud run deploy --source .` which runs Cloud Build for you.
# Re-running this script does an in-place update (new revision).

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
export PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project)}"
export REGION="${REGION:-asia-south1}"
export SERVICE="amazon-discovery"
export SA="n8n-sa@${PROJECT_ID}.iam.gserviceaccount.com"
export SCHEDULER_SA="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

# Override these via env if needed.
export SHEETS_DOCUMENT_ID="${SHEETS_DOCUMENT_ID:-1onm967wGWmy2YpwNJxr_UEDkFGb8Ibx22unKLXuKj3g}"
export SHEETS_SIGNALS_TAB="${SHEETS_SIGNALS_TAB:-Signals}"
export SHEETS_DIGESTS_TAB="${SHEETS_DIGESTS_TAB:-Weekly Digests}"
export EMAIL_FROM="${EMAIL_FROM:-ritikadas98@gmail.com}"
export SMTP_USER="${SMTP_USER:-ritikadas98@gmail.com}"
export DEFAULT_RECIPIENT="${DEFAULT_RECIPIENT:-ritikadas98@gmail.com}"
export CORS_ORIGIN="${CORS_ORIGIN:-*}"

# Vertex AI (defaults to same project as Cloud Run; override to use a different one)
export VERTEX_PROJECT_ID="${VERTEX_PROJECT_ID:-${PROJECT_ID}}"
export VERTEX_REGION="${VERTEX_REGION:-asia-south1}"
export VERTEX_MODEL="${VERTEX_MODEL:-gemini-2.5-flash}"

# ─── 1. Sanity check ──────────────────────────────────────────────────────────
if [[ ! -f Dockerfile ]]; then
  echo "❌ No Dockerfile in $(pwd). Run this from the project root." >&2
  exit 1
fi

# ─── 2. Deploy (Cloud Build + Cloud Run in one shot) ──────────────────────────
echo "▶ Deploying ${SERVICE} to Cloud Run in ${REGION}…"
gcloud run deploy "${SERVICE}" \
  --source . \
  --region="${REGION}" \
  --service-account="${SA}" \
  --port=3000 \
  --memory=512Mi --cpu=1 \
  --min-instances=0 --max-instances=2 \
  --timeout=120 \
  --allow-unauthenticated \
  --set-env-vars="USE_MOCK=true,VERTEX_PROJECT_ID=${VERTEX_PROJECT_ID},VERTEX_REGION=${VERTEX_REGION},VERTEX_MODEL=${VERTEX_MODEL},SHEETS_DOCUMENT_ID=${SHEETS_DOCUMENT_ID},SHEETS_SIGNALS_TAB=${SHEETS_SIGNALS_TAB},SHEETS_DIGESTS_TAB=${SHEETS_DIGESTS_TAB},SMTP_HOST=smtp.gmail.com,SMTP_PORT=465,SMTP_USER=${SMTP_USER},EMAIL_FROM=${EMAIL_FROM},DEFAULT_RECIPIENT=${DEFAULT_RECIPIENT},CORS_ORIGIN=${CORS_ORIGIN}" \
  --set-secrets="SMTP_PASS=smtp-pass:latest"

# ─── 3. Get URL ───────────────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" --format='value(status.url)')
echo
echo "▶ Service URL: ${SERVICE_URL}"

# ─── 4. Grant scheduler-invoker permission to invoke ─────────────────────────
echo "▶ Granting roles/run.invoker to ${SCHEDULER_SA}…"
gcloud run services add-iam-policy-binding "${SERVICE}" \
  --region="${REGION}" \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker" --quiet >/dev/null

# ─── 5. Create/update the monthly Cloud Scheduler job ─────────────────────────
JOB_NAME="amazon-discovery-monthly"
JOB_EXISTS=$(gcloud scheduler jobs describe "${JOB_NAME}" --location="${REGION}" \
  --format='value(name)' 2>/dev/null || true)

if [[ -n "${JOB_EXISTS}" ]]; then
  echo "▶ Updating existing Scheduler job ${JOB_NAME}…"
  gcloud scheduler jobs update http "${JOB_NAME}" \
    --location="${REGION}" \
    --schedule="0 9 1 * *" \
    --time-zone="Asia/Kolkata" \
    --uri="${SERVICE_URL}/run-pipeline" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body="{\"recipient_email\":\"${DEFAULT_RECIPIENT}\"}" \
    --oidc-service-account-email="${SCHEDULER_SA}"
else
  echo "▶ Creating Scheduler job ${JOB_NAME}…"
  gcloud scheduler jobs create http "${JOB_NAME}" \
    --location="${REGION}" \
    --schedule="0 9 1 * *" \
    --time-zone="Asia/Kolkata" \
    --uri="${SERVICE_URL}/run-pipeline" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body="{\"recipient_email\":\"${DEFAULT_RECIPIENT}\"}" \
    --oidc-service-account-email="${SCHEDULER_SA}"
fi

echo
echo "✅ Deployment complete."
echo
echo "Quick tests:"
echo "  curl ${SERVICE_URL}/health"
echo "  curl -X POST ${SERVICE_URL}/run-pipeline -H 'Content-Type: application/json' -d '{\"recipient_email\":\"${DEFAULT_RECIPIENT}\"}'"
echo "  curl '${SERVICE_URL}/digests?limit=5'"
echo "  curl '${SERVICE_URL}/runs/latest'"
echo
echo "Manually fire the scheduler:"
echo "  gcloud scheduler jobs run ${JOB_NAME} --location=${REGION}"
