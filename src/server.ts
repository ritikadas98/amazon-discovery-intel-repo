import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { getEnv } from './config/env.js';
import { runPipeline } from './pipeline/run.js';
import { appendRows, readRows } from './lib/sheets.js';
import { handleChatStream, type ChatTurn } from './agents/chat.js';

const env = getEnv();
const app = express();
// Behind Cloud Run's single proxy hop: trust it so rate-limiting and req.ip key
// on the real client IP. Use `1` (one hop), not `true` — the latter trips
// express-rate-limit's permissive-trust-proxy guard.
app.set('trust proxy', 1);

const corsOrigin =
  env.CORS_ORIGIN === '*'
    ? true
    : env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// Rate limiting. The service is public + unauthenticated, so this is the primary
// abuse/cost guard: a generous global cap, plus tighter caps on the endpoints
// that spend money (paid Vertex calls / outbound email). Keyed per client IP.
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const pipelineLimiter = rateLimit({
  windowMs: 60_000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pipeline runs — please wait a minute and retry.' },
});
const chatLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests — please slow down.' },
});
app.use(generalLimiter);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Pipeline trigger ────────────────────────────────────────────────────────
// Validate + allowlist the recipient before it reaches nodemailer. On a public
// endpoint this blocks email header/command injection (reject CRLF + list
// separators) and stops the endpoint being used to mail arbitrary addresses.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
function isValidEmail(s: string): boolean {
  return s.length <= 254 && !/[\r\n]/.test(s) && EMAIL_RE.test(s);
}
// Addresses /run-pipeline may email. Explicit ALLOWED_RECIPIENTS wins; otherwise
// fall back to [DEFAULT_RECIPIENT]. Empty (neither set) => no allowlist enforced
// (local dev), but the format check above still applies.
function allowedRecipients(): string[] {
  const explicit = (env.ALLOWED_RECIPIENTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (explicit.length) return explicit;
  return env.DEFAULT_RECIPIENT ? [env.DEFAULT_RECIPIENT.toLowerCase()] : [];
}

const runPipelineHandler = async (req: Request, res: Response) => {
  const recipient_email = (req.body?.recipient_email as string | undefined) || env.DEFAULT_RECIPIENT;
  if (!recipient_email) {
    res.status(400).json({ error: 'recipient_email is required (in body or DEFAULT_RECIPIENT env var)' });
    return;
  }
  if (!isValidEmail(recipient_email)) {
    res.status(400).json({ error: 'recipient_email is not a valid email address.' });
    return;
  }
  const allowed = allowedRecipients();
  if (allowed.length && !allowed.includes(recipient_email.toLowerCase())) {
    res.status(403).json({ error: 'recipient_email is not in the allowed recipients list.' });
    return;
  }
  // Optional per-run override of mock vs live (else env.USE_MOCK). Lets the UI's
  // Sample/Live toggle decide what a triggered run ingests.
  const use_mock = typeof req.body?.use_mock === 'boolean' ? (req.body.use_mock as boolean) : undefined;
  try {
    const result = await runPipeline({ recipient_email, use_mock });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[server] Pipeline failed:', message, stack);
    res.status(500).json({ error: message });
  }
};

app.post('/run-pipeline', pipelineLimiter, runPipelineHandler);
app.post('/webhook/run-pipeline', pipelineLimiter, runPipelineHandler);

// ─── Sheets read endpoints ───────────────────────────────────────────────────
app.get('/digests', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '10'), 10) || 10, 1), 100);
    const week = req.query.week as string | undefined;
    const rows = await readRows(env.SHEETS_DIGESTS_TAB);
    const filtered = week ? rows.filter((r) => r['Week ID'] === week) : rows;
    const sorted = filtered.sort((a, b) => parseInt(b.row_number, 10) - parseInt(a.row_number, 10));
    res.json({ count: sorted.length, returned: Math.min(sorted.length, limit), rows: sorted.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/signals', async (req: Request, res: Response) => {
  try {
    const week = req.query.week as string | undefined;
    const group = req.query.group as string | undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '500'), 10) || 500, 1), 5000);
    const rows = await readRows(env.SHEETS_SIGNALS_TAB);
    let filtered = rows;
    if (week) filtered = filtered.filter((r) => r['Week ID'] === week);
    if (group && group !== 'all') filtered = filtered.filter((r) => r['Feature Group ID'] === group);
    const sorted = filtered.sort((a, b) => parseInt(b.row_number, 10) - parseInt(a.row_number, 10));
    res.json({
      count: sorted.length,
      returned: Math.min(sorted.length, limit),
      week: week ?? null,
      group: group ?? null,
      rows: sorted.slice(0, limit),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/runs/latest', async (_req: Request, res: Response) => {
  try {
    const rows = await readRows(env.SHEETS_DIGESTS_TAB);
    if (rows.length === 0) {
      res.status(404).json({ error: 'No runs yet.' });
      return;
    }
    const latest = rows.reduce((a, b) =>
      parseInt(b.row_number, 10) > parseInt(a.row_number, 10) ? b : a,
    );
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Effort overrides (Enhancement 5) ────────────────────────────────────────
// Existing "Effort Estimates" sheet columns:
//   Theme ID | Feature Group ID | Week ID | Effort Value | Set By | Set At
app.post('/webhook/set-effort', async (req: Request, res: Response) => {
  try {
    const theme_id = String(req.body?.theme_id ?? '').trim();
    const week_id = String(req.body?.week_id ?? '').trim();
    const feature_group_id = String(req.body?.feature_group_id ?? '').trim();
    const set_by = String(req.body?.set_by ?? env.DEFAULT_RECIPIENT ?? '').trim();
    const effortRaw = Number(req.body?.effort);

    if (!theme_id || !week_id || !Number.isFinite(effortRaw) || effortRaw <= 0) {
      res.status(400).json({
        error: 'theme_id, week_id, and a positive numeric effort are required.',
      });
      return;
    }

    await appendRows(env.SHEETS_EFFORT_TAB, [
      {
        'Theme ID': theme_id,
        'Feature Group ID': feature_group_id,
        'Week ID': week_id,
        'Effort Value': effortRaw,
        'Set By': set_by,
        'Set At': new Date().toISOString(),
      },
    ]);
    res.json({ ok: true, theme_id, week_id, effort: effortRaw });
  } catch (err) {
    console.error('[server] set-effort failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/effort-overrides', async (req: Request, res: Response) => {
  try {
    const week = req.query.week as string | undefined;
    const rows = await readRows(env.SHEETS_EFFORT_TAB);
    const filtered = week ? rows.filter((r) => r['Week ID'] === week) : rows;

    // The sheet is append-only — collapse to the latest entry per (theme_id, week_id) by row_number.
    const latestByKey: Record<string, Record<string, string>> = {};
    for (const row of filtered) {
      const key = `${row['Theme ID']}__${row['Week ID']}`;
      const existing = latestByKey[key];
      if (!existing || parseInt(row.row_number, 10) > parseInt(existing.row_number, 10)) {
        latestByKey[key] = row;
      }
    }
    res.json({
      week: week ?? null,
      overrides: Object.values(latestByKey).map((r) => ({
        theme_id: r['Theme ID'],
        week_id: r['Week ID'],
        feature_group_id: r['Feature Group ID'],
        effort: Number(r['Effort Value']),
        set_by: r['Set By'],
        updated_at: r['Set At'],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PM feedback loop (Enhancement 3) ────────────────────────────────────────
const VALID_RATINGS = new Set(['useful', 'not_useful']);

function thankYouHtml(rating: string, theme_id: string): string {
  const isUseful = rating === 'useful';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Feedback recorded</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f4f4f5; margin:0; padding:48px 16px; color:#1a1a1a; }
  .card { max-width: 480px; margin: 0 auto; background:#fff; border-radius:8px; padding:32px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); text-align:center; }
  .emoji { font-size: 48px; line-height:1; margin-bottom:12px; }
  h1 { margin: 0 0 8px 0; font-size: 20px; }
  p { color:#555; font-size: 14px; line-height: 1.5; }
  code { background:#f4f3ec; padding: 2px 6px; border-radius:4px; font-size: 12px; }
</style></head><body>
  <div class="card">
    <div class="emoji">${isUseful ? '👍' : '👎'}</div>
    <h1>Feedback recorded</h1>
    <p>Thanks — we logged this theme as <strong>${isUseful ? 'useful' : 'not useful'}</strong>.</p>
    <p><code>${theme_id}</code></p>
    <p style="color:#999;font-size:12px;margin-top:24px;">You can close this tab.</p>
  </div>
</body></html>`;
}

// Existing "Feedback" sheet columns:
//   Week ID | Feature Group ID | PM Email | Rating | Recieved At
//   (the "Recieved" misspelling is the existing header — we match it as-is.)
app.get('/webhook/digest-feedback', async (req: Request, res: Response) => {
  try {
    const theme_id = String(req.query.theme_id ?? '').trim();
    const week_id = String(req.query.week_id ?? '').trim();
    const feature_group_id = String(req.query.feature_group_id ?? '').trim();
    const rating = String(req.query.rating ?? '').trim();
    const pm_email = String(req.query.pm_email ?? req.query.recipient ?? '').trim();

    if (!theme_id || !week_id || !VALID_RATINGS.has(rating)) {
      res.status(400).type('text/plain').send(
        'Bad request: theme_id, week_id, and a valid rating (useful|not_useful) are required.',
      );
      return;
    }

    await appendRows(env.SHEETS_FEEDBACK_TAB, [
      {
        'Week ID': week_id,
        'Feature Group ID': feature_group_id,
        'PM Email': pm_email,
        Rating: rating,
        'Recieved At': new Date().toISOString(),
      },
    ]);

    res.type('text/html').send(thankYouHtml(rating, theme_id));
  } catch (err) {
    console.error('[server] digest-feedback failed:', err);
    res.status(500).type('text/plain').send('Could not record feedback. Please try again later.');
  }
});

// ─── RAG chat (Track 1) ──────────────────────────────────────────────────────
// Streams a Gemini reply as Server-Sent Events. Body:
//   { message: string, history?: {role,content}[], group?: string, week?: string }
function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw) {
    const role = (item as { role?: unknown })?.role;
    const content = (item as { content?: unknown })?.content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      out.push({ role, content });
    }
  }
  return out;
}

app.post('/webhook/chat', chatLimiter, async (req: Request, res: Response) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) {
    res.status(400).json({ error: 'message is required.' });
    return;
  }
  const history = sanitizeHistory(req.body?.history);
  const group = req.body?.group ? String(req.body.group) : undefined;
  const week = req.body?.week ? String(req.body.week) : undefined;
  const source = req.body?.source ? String(req.body.source).toLowerCase() : undefined;

  // Once we flush SSE headers, all errors must be reported as SSE events
  // (we can no longer switch to a JSON status code).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (Cloud Run / nginx)
  res.flushHeaders();

  try {
    for await (const delta of handleChatStream(message, history, group, week, source)) {
      res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
    }
    res.write('event: done\ndata: {}\n\n');
    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[server] chat failed:', msg);
    res.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  console.log(`[server] Listening on http://localhost:${env.PORT}`);
  console.log(
    `[server] Endpoints: GET /health, GET /digests, GET /signals, GET /runs/latest, ` +
      `GET /effort-overrides, GET /webhook/digest-feedback, POST /run-pipeline, ` +
      `POST /webhook/run-pipeline, POST /webhook/set-effort, POST /webhook/chat`,
  );
});

const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — shutting down.`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
