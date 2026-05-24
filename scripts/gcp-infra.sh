#!/usr/bin/env bash
# GCP infra setup for amazon-discovery — run this in Cloud Shell.
#
# What this does (idempotent — safe to re-run):
#   1. Decommissions the old n8n stack (Cloud SQL + Cloud Run service + 2 stale secrets)
#   2. Enables Artifact Registry, Cloud Scheduler, Cloud Build APIs
#   3. Re-IAMs the existing n8n-sa service account (drops cloudsql.client)
#   4. Creates Artifact Registry repo for the new container image
#   5. Creates the smtp-pass secret
#   6. Creates the scheduler-invoker service account
#
# What this does NOT do:
#   - Build/deploy the container (see scripts/gcp-deploy.sh)
#   - Create the Cloud Scheduler job (created after deploy, in gcp-deploy.sh)
#
# Prereqs:
#   - Cloud Shell session in the same GCP project where you set up the n8n stack
#   - You did steps 1–5 of n8n-gcp-hosting-guide.md (so n8n-sa, n8n-db, gemini-api-key exist)

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────
export PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project)}"
export REGION="${REGION:-asia-south1}"
export REPO="amazon-discovery"
export SA_NAME="n8n-sa"
export SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export SCHEDULER_SA_NAME="scheduler-invoker"
export SCHEDULER_SA="${SCHEDULER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Project: ${PROJECT_ID}"
echo "Region : ${REGION}"
echo

# ─── 1. Decommission old n8n stack ────────────────────────────────────────────
echo "▶ Deleting Cloud Run service 'n8n' (if exists)…"
gcloud run services delete n8n --region="${REGION}" --quiet 2>/dev/null \
  || echo "  (already absent)"

echo "▶ Deleting Cloud SQL instance 'n8n-db' (if exists)…"
# Remove deletion protection if set, then delete.
gcloud sql instances patch n8n-db --no-deletion-protection --quiet 2>/dev/null || true
gcloud sql instances delete n8n-db --quiet 2>/dev/null \
  || echo "  (already absent)"

echo "▶ Deleting stale secrets…"
for s in n8n-db-password n8n-encryption-key; do
  gcloud secrets delete "$s" --quiet 2>/dev/null \
    || echo "  $s (already absent)"
done

# ─── 2. Enable additional APIs ────────────────────────────────────────────────
echo "▶ Enabling Artifact Registry, Cloud Scheduler, Cloud Build APIs…"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com

# ─── 3. Re-IAM the n8n-sa service account ─────────────────────────────────────
echo "▶ Dropping roles/cloudsql.client from ${SA}…"
gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA}" \
  --role="roles/cloudsql.client" --quiet 2>/dev/null \
  || echo "  (role not bound)"

# ─── 4. Artifact Registry repo ────────────────────────────────────────────────
echo "▶ Creating Artifact Registry repo '${REPO}'…"
gcloud artifacts repositories create "${REPO}" \
  --repository-format=docker --location="${REGION}" --quiet 2>/dev/null \
  || echo "  (already exists)"

# ─── 5. SMTP secret ───────────────────────────────────────────────────────────
if gcloud secrets describe smtp-pass >/dev/null 2>&1; then
  echo "▶ Secret 'smtp-pass' already exists — skipping creation."
else
  echo "▶ Creating secret 'smtp-pass'…"
  read -srp "  Paste Gmail app password (no spaces): " SMTP_PASS_VALUE; echo
  printf "%s" "${SMTP_PASS_VALUE}" | gcloud secrets create smtp-pass \
    --replication-policy=automatic --data-file=-
  unset SMTP_PASS_VALUE
fi

echo "▶ Granting secretAccessor on smtp-pass and gemini-api-key to ${SA}…"
for secret in smtp-pass gemini-api-key; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
done

# ─── 6. Scheduler invoker SA ──────────────────────────────────────────────────
if gcloud iam service-accounts describe "${SCHEDULER_SA}" >/dev/null 2>&1; then
  echo "▶ Service account ${SCHEDULER_SA_NAME} already exists — skipping."
else
  echo "▶ Creating ${SCHEDULER_SA_NAME} service account…"
  gcloud iam service-accounts create "${SCHEDULER_SA_NAME}" \
    --display-name="Cloud Scheduler invoker for amazon-discovery"
fi

echo
echo "✅ Infra setup complete."
echo
echo "Reminder: share Google Sheet 1onm967wGWmy2YpwNJxr_UEDkFGb8Ibx22unKLXuKj3g"
echo "          with ${SA} as Editor (in the Sheets UI)."
echo
echo "Next: run scripts/gcp-deploy.sh from the project directory."
