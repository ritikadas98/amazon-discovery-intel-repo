# n8n on GCP — Full Hosting Guide
*Exported from Claude conversation — May 23, 2026*

---

## 1. Hosting Options (Most to Least Popular)

### 1. VPS + Docker (Hetzner, DigitalOcean, Vultr)
The default choice for technical users. Spin up a small VPS, run the official n8n Docker image with Postgres, expose via Caddy/Traefik with auto-HTTPS.

- Hetzner CX22 (2 vCPU, 4GB RAM): ~€4.5/mo (~₹420)
- DigitalOcean Basic Droplet: $6/mo (₹510)
- Vultr: realistic floor at $6/mo (₹510) for 1GB RAM

### 2. n8n Cloud (managed)
- Starter: €20/mo annual (~₹1,800), 2,500 executions
- Pro: $60/mo (~₹5,100), 10,000 executions
- Business: €800/mo, 40,000 executions

### 3. Render.com
- Web Service Standard: $25/mo (~₹2,100) for 2GB RAM
- Managed Postgres: $7–19/mo on top
- Realistic total: ~$32–45/mo (~₹2,700–3,800)

### 4. Railway
- Usage-based, ~$5–15/mo for light workloads

### 5. GCP e2-micro (free tier)
- Free forever in `us-west1`, `us-central1`, `us-east1`
- Outside free tier: ~$7/mo (~₹600)

### 6. Oracle Cloud Always Free
- 4 ARM cores, 24GB RAM across instances, free forever
- Cost: ₹0

### 7. Coolify on VPS
- Self-hosted PaaS with visual dashboard over Docker
- Cost = underlying VPS (~₹420/mo on Hetzner)

### 8. Managed n8n shops
- PikaPods: ~$3.80/mo (~₹320)
- InstaPods: ~$3/mo (~₹255)
- Elestio: business-grade, 4–5x pricier
- Northflank: ~$10–20/mo

### 9. Home server / Raspberry Pi + Cloudflare Tunnel
- Hardware one-time: ~₹6,000–8,000
- Running cost: ~₹150/mo electricity

---

## 2. Full Guide: Cloud Run + Cloud SQL

### Architecture
```
[Browser] → [Cloud Run: n8n] → [Cloud SQL: Postgres 15]
                ↓
        [Secret Manager] (DB password, encryption key)
                ↓
        [Service Account] (least-privilege IAM)
```

**Cost estimate (Mumbai region):**
| Component | Config | Cost |
|---|---|---|
| Cloud SQL db-g1-small (always on) | 1.7GB RAM, 10GB SSD | ~₹1,100/mo |
| Cloud SQL (stopped 6 days/week) | Started Sunday only | ~₹350/mo |
| Cloud Run | Weekly digest, scale-to-zero | ~₹0–80/mo |
| Secret Manager | 3 secrets | ~₹15/mo |
| Egress | Light | ~₹50/mo |

---

### Step 0 — Pre-flight

Open Cloud Shell. Set your project and export variables:

```bash
gcloud auth list
gcloud config set project YOUR_PROJECT_ID

export PROJECT_ID=$(gcloud config get-value project)
export REGION=asia-south1   # Mumbai
export INSTANCE=n8n-db
export DB_NAME=n8n
export DB_USER=n8n-user
export SERVICE=n8n
```

Enable APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  compute.googleapis.com
```

---

### Step 1 — Cloud SQL Postgres

```bash
export ROOT_PW=$(openssl rand -base64 24)
echo "Root password (save this): $ROOT_PW"

gcloud sql instances create $INSTANCE \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=$REGION \
  --edition=ENTERPRISE \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup \
  --backup-start-time=18:30 \
  --root-password="$ROOT_PW"

gcloud sql databases create $DB_NAME --instance=$INSTANCE

export DB_PW=$(openssl rand -base64 24)
gcloud sql users create $DB_USER \
  --instance=$INSTANCE \
  --password="$DB_PW"
```

---

### Step 2 — Secret Manager

```bash
# DB password
printf "$DB_PW" | gcloud secrets create n8n-db-password \
  --replication-policy=automatic --data-file=-

# Encryption key
openssl rand -base64 42 | tr -d '\n' > /tmp/enc-key
gcloud secrets create n8n-encryption-key \
  --data-file=/tmp/enc-key --replication-policy=automatic
rm /tmp/enc-key

# Gemini API key
read -s -p "Paste Gemini API key: " GEMINI_KEY; echo
printf "$GEMINI_KEY" | gcloud secrets create gemini-api-key \
  --replication-policy=automatic --data-file=-
unset GEMINI_KEY
```

> **Important:** Back up the encryption key in a password manager. Losing it means all saved n8n credentials are unrecoverable.

---

### Step 3 — Least-privilege Service Account

```bash
gcloud iam service-accounts create n8n-sa \
  --display-name="n8n Cloud Run Service Account"

export SA=n8n-sa@$PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" \
  --role="roles/cloudsql.client"

for secret in n8n-db-password n8n-encryption-key gemini-api-key; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

### Step 4 — Deploy n8n to Cloud Run

> **Note:** Use `n8nio/n8n:latest` (Docker Hub). Cloud Run does not accept `docker.n8n.io` as a registry.
> `--max-instances=1` is critical — n8n is not designed for horizontal scaling without queue mode + Redis.

```bash
gcloud run deploy $SERVICE \
  --image=n8nio/n8n:latest \
  --command="/bin/sh" \
  --args="-c,sleep 5; n8n start" \
  --region=$REGION \
  --allow-unauthenticated \
  --port=5678 \
  --memory=2Gi \
  --cpu=1 \
  --no-cpu-throttling \
  --min-instances=0 \
  --max-instances=1 \
  --timeout=3600 \
  --service-account=$SA \
  --add-cloudsql-instances=$PROJECT_ID:$REGION:$INSTANCE \
  --set-env-vars="N8N_PORT=5678,N8N_PROTOCOL=https,N8N_ENDPOINT_HEALTH=health,DB_TYPE=postgresdb,DB_POSTGRESDB_DATABASE=$DB_NAME,DB_POSTGRESDB_USER=$DB_USER,DB_POSTGRESDB_HOST=/cloudsql/$PROJECT_ID:$REGION:$INSTANCE,DB_POSTGRESDB_PORT=5432,DB_POSTGRESDB_SCHEMA=public,GENERIC_TIMEZONE=Asia/Kolkata,N8N_DEFAULT_LOCALE=en,EXECUTIONS_DATA_PRUNE=true,EXECUTIONS_DATA_MAX_AGE=336,N8N_RUNNERS_ENABLED=true,QUEUE_HEALTH_CHECK_ACTIVE=true" \
  --set-secrets="DB_POSTGRESDB_PASSWORD=n8n-db-password:latest,N8N_ENCRYPTION_KEY=n8n-encryption-key:latest"
```

After deploy, set `N8N_HOST` and `WEBHOOK_URL`:

```bash
export SERVICE_URL=$(gcloud run services describe $SERVICE \
  --region=$REGION --format='value(status.url)')
export SERVICE_HOST=$(echo $SERVICE_URL | sed 's|https://||')

gcloud run services update $SERVICE \
  --region=$REGION \
  --update-env-vars="N8N_HOST=$SERVICE_HOST,WEBHOOK_URL=$SERVICE_URL/,N8N_EDITOR_BASE_URL=$SERVICE_URL/"
```

**Get the Service URL at any time:**
```bash
gcloud run services describe n8n \
  --region=$REGION \
  --format='value(status.url)'
```
Or: Cloud Console → Cloud Run → your `n8n` service.

---

### Step 5 — First-run Setup

Open `$SERVICE_URL` in a browser. If you see "Cannot GET /", wait 20 seconds and refresh (cold start). Complete the Owner Account setup screen.

---

### Step 6 — Migrate Workflows

#### Export from old n8n instance
- Open each workflow → three-dot menu (top-right) → **Download** → saves `.json`
- Do this for all workflows

> **Note:** Render's free Postgres expires after 30 days with no backups. If the instance shows `{"code":503,"message":"Database is not ready!"}`, the database has likely expired. Upgrade to a paid Render Postgres ($7/mo) to recover data within the 14-day grace period.

#### Import to Cloud Run n8n
- Workflows → Import from File → upload each JSON

---

### Step 7 — Hardening

**Enable deletion protection on Cloud SQL:**
```bash
gcloud sql instances patch $INSTANCE --deletion-protection
```

**Stop Cloud SQL when not in use (saves ~70% cost):**
```bash
# Stop
gcloud sql instances patch $INSTANCE --activation-policy=NEVER

# Start
gcloud sql instances patch $INSTANCE --activation-policy=ALWAYS
```

**Set budget alerts:** Billing → Budgets & alerts → create budget at ₹1,500/mo with alerts at 50%/90%/100%.

---

### Step 8 — Custom Domain (optional)

```bash
gcloud beta run domain-mappings create \
  --service=$SERVICE \
  --domain=n8n.yourdomain.com \
  --region=$REGION
```

Then update env vars:
```bash
gcloud run services update $SERVICE --region=$REGION \
  --update-env-vars="N8N_HOST=n8n.yourdomain.com,WEBHOOK_URL=https://n8n.yourdomain.com/,N8N_EDITOR_BASE_URL=https://n8n.yourdomain.com/"
```

---

### Troubleshooting

```bash
# Tail logs
gcloud run services logs tail $SERVICE --region=$REGION

# Connect to DB directly
gcloud sql connect $INSTANCE --user=$DB_USER --database=$DB_NAME

# Force a new revision
gcloud run services update $SERVICE --region=$REGION
```

**Common issues:**
- `"Cannot GET /"` on first load → n8n still booting, wait 30s and refresh
- Webhook URLs wrong → `N8N_HOST` / `WEBHOOK_URL` env vars not updated after domain mapping
- OAuth redirect mismatch → redirect URI in Google Cloud OAuth consent must match `$SERVICE_URL/rest/oauth2-credential/callback`

---

## 3. Migrating Amazon Discovery Intelligence Workflow

### Credentials to recreate

| Credential | Node(s) | Type |
|---|---|---|
| Gemini API | Gemini Flash - Clean Signal, Gemini Flash - Synthesize, Readiness node | HTTP Header Auth |
| Google Service Account | Fetch Last Week Data, Write Scores to Sheet1, other Sheets nodes | Google Service Account |
| SMTP (RSMTP account) | Regression Alert Email, Digest Email | SMTP |

### Step-by-step

**1. Fix model deprecation (do this before importing)**

`gemini-3.1-flash-lite-preview` was shut down on May 25, 2026. In the workflow JSON, find-and-replace (3 occurrences):

```
# Old (broken)
https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent

# New (correct)
https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent
```

**2. Import the updated JSON**
- Workflows → Import from File

**3. Recreate Gemini API credential**
- Credentials → Add → **Header Auth**
- Name: `Gemini API`
- Header Name: `x-goog-api-key`
- Header Value: your key from [aistudio.google.com/app/api-keys](https://aistudio.google.com/app/api-keys)

**4. Recreate Google Service Account credential**
- GCP Console → IAM → Service Accounts → `n8n-sa` → Keys → Add Key → JSON → Download
- n8n → Credentials → Add → **Google Service Account**
- Name: `Ritika Das Google Service Account account`
- Paste the downloaded JSON key file contents
- Share the Google Sheet (`1onm967wGWmy2YpwNJxr_UEDkFGb8Ibx22unKLXuKj3g`) with `n8n-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com` as **Editor**

**5. Recreate SMTP credential**
- Credentials → Add → **SMTP**
- Name: `RSMTP account`
- Host: `smtp.gmail.com`, Port: `465`, SSL: on
- User: `ritikadas98@gmail.com`
- Password: Gmail App Password from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

**6. Update WEBHOOK_URL in Cloud Shell**
```bash
export SERVICE_URL=$(gcloud run services describe n8n --region=$REGION --format='value(status.url)')
export SERVICE_HOST=$(echo $SERVICE_URL | sed 's|https://||')

gcloud run services update n8n \
  --region=$REGION \
  --update-env-vars="N8N_HOST=$SERVICE_HOST,WEBHOOK_URL=$SERVICE_URL/,N8N_EDITOR_BASE_URL=$SERVICE_URL/"
```

**7. Test run**
- Confirm `Check Mock Mode` node has `useMock = true`
- Click **Test workflow**
- Verify rows appear in the Google Sheet `Signals` tab
- When ready for production: set `useMock = false`, toggle workflow **Active**

---

*End of guide*
