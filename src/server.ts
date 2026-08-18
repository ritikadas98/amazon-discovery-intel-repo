import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { getEnv } from './config/env.js';
import { FORMULA_VERSION } from './types.js';
import { runPipeline } from './pipeline/run.js';
import { appendRows, readRows } from './lib/sheets.js';
import { sendEmail } from './lib/email.js';
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

/**
 * Liveness, plus which build is actually serving.
 *
 * `--source .` deploys whatever is in the folder the script was run from, not
 * what is on the default branch — so a stale clone silently ships old code and
 * the only way to find out was to run the pipeline and inspect the row it
 * wrote. Three runs were spent that way. Now the answer is one curl.
 *
 * `formulaVersion` is the honest tell: it is the constant the scoring code
 * carries, so if this says 2 the deployed build has the current formula, the
 * evidence block and the widened diagnosis gate.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    formulaVersion: FORMULA_VERSION,
    features: {
      themeEvidence: true,
      diagnosisFallsBackWhenNothingReady: true,
      // Added 2026-08-18. If these are missing, the running revision predates the
      // fixes and a pipeline run will reproduce the contradictions.
      countedCriteriaBeatTheModel: true,
      headlineCutsAtAClause: true,
      diagnosisPerGroup: true,
      reuseAnalysisWithin24h: true,
      reuseSendsTheStoredEmail: true,
      ownerCanForceARun: true,
      openRecipients: true,
    },
  });
});

// ─── Pipeline trigger ────────────────────────────────────────────────────────
// Validate + allowlist the recipient before it reaches nodemailer. On a public
// endpoint this blocks email header/command injection (reject CRLF + list
// separators) and stops the endpoint being used to mail arbitrary addresses.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
function isValidEmail(s: string): boolean {
  return s.length <= 254 && !/[\r\n]/.test(s) && EMAIL_RE.test(s);
}
// Addresses /run-pipeline may email. Set ALLOWED_RECIPIENTS to restrict; leave it
// unset and anyone may ask for the digest at their own address, which is the point
// of a public demo — a reader of the LinkedIn post should be able to receive the
// thing being described rather than only read about it.
function allowedRecipients(): string[] {
  return (env.ALLOWED_RECIPIENTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// ── Send caps ───────────────────────────────────────────────────────────────
//
// Open recipients mean anyone can make this service send mail from Ritika's Gmail
// to an address of their choosing. Left uncapped that is a way to mail a stranger
// who never asked, and the account that gets suspended for it is hers.
//
// Held in memory rather than a sheet. Cloud Run scales to zero, so these counters
// reset when the service sleeps — which is exactly when they are not needed. During
// a burst the instance stays warm and the caps hold, and max-instances is 2, so at
// worst the real ceiling is twice these numbers. Gmail's own ~500/day limit is the
// backstop underneath.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_DAY = 100;
const lastSendByAddress = new Map<string, number>();
let dayStartedAt = Date.now();
let sendsToday = 0;

function sendAllowance(address: string): { ok: true } | { ok: false; reason: string } {
  const now = Date.now();
  if (now - dayStartedAt > ONE_DAY_MS) {
    dayStartedAt = now;
    sendsToday = 0;
  }
  if (sendsToday >= MAX_SENDS_PER_DAY) {
    return { ok: false, reason: 'This has sent its limit of digests for today. Try again tomorrow.' };
  }
  const last = lastSendByAddress.get(address.toLowerCase());
  if (last && now - last < ONE_DAY_MS) {
    return { ok: false, reason: "That address already has this week's digest. One per address per day." };
  }
  return { ok: true };
}

function recordSend(address: string): void {
  lastSendByAddress.set(address.toLowerCase(), Date.now());
  sendsToday += 1;
}

/**
 * When did a real pipeline run last finish?
 *
 * Read from the newest Digests row rather than held in memory, because Cloud Run
 * scales to zero and an in-memory timestamp would not survive the gap between one
 * visitor and the next.
 */
async function newestRun(): Promise<{ at: Date; row: Record<string, string> } | null> {
  const rows = await readRows(env.SHEETS_DIGESTS_TAB);
  let newest: { at: Date; row: Record<string, string> } | null = null;
  for (const r of rows) {
    const raw = r['Created At'];
    if (!raw) continue;
    const at = new Date(raw);
    if (!Number.isNaN(at.getTime()) && (!newest || at > newest.at)) newest = { at, row: r };
  }
  return newest;
}

/**
 * The fallback when there is no stored digest to send.
 *
 * Reuse normally re-sends the exact email the run produced, kept on its row. This
 * covers the two cases where that is absent: rows written before the email was
 * stored, and a week too large for a single cell. It says which week is ready and
 * links straight to it, rather than rebuilding a digest that could quietly differ
 * from the original.
 */
async function sendDigestPointer(to: string, ranAt: Date): Promise<void> {
  const app = (env.APP_BASE_URL ?? 'https://amazon.ritikadas.in').replace(/\/$/, '');
  const when = ranAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
  <h1 style="font-size:20px;margin:0 0 12px 0;">This week's analysis is ready</h1>
  <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px 0;">
    It last ran on ${when}. Nothing new has come in since, so this is the current picture.
  </p>
  <a href="${app}/digest?group=all" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Open the digest</a>
  <p style="font-size:12px;line-height:1.6;color:#777;margin:24px 0 0 0;">
    Amazon Discovery Intelligence reads customer reviews across the app stores and
    groups them into the problems worth acting on.
  </p>
</div>`;
  await sendEmail({ to, subject: "Amazon Discovery — this week's analysis", html });
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
  const allowance = sendAllowance(recipient_email);
  if (!allowance.ok) {
    res.status(429).json({ error: allowance.reason });
    return;
  }
  // Optional per-run override of mock vs live (else env.USE_MOCK). Lets the UI's
  // Sample/Live toggle decide what a triggered run ingests.
  const use_mock = typeof req.body?.use_mock === 'boolean' ? (req.body.use_mock as boolean) : undefined;
  try {
    // ── the 24-hour rule ────────────────────────────────────────────────────
    //
    // A second run on the same day ingests almost nothing: every review has
    // already been seen, so the run either fails outright or writes a hollow
    // week — and the dashboard always shows the newest week. One curious visitor
    // could therefore blank the page for everyone after them. Re-running also
    // costs three to five rupees each time, which is now Ritika's own money.
    //
    // So within the window we serve what is already there. No message is shown:
    // the sidebar already prints when the pipeline last ran, so the result is
    // dated without anyone being told they were refused.
    // The owner's way past her own rule.
    //
    // The 24-hour window is aimed at visitors, but it applies to every caller —
    // including Ritika, whose first attempt at a real run after shipping the rule
    // was refused 12 hours into the window. A launch cannot depend on waiting out
    // a timer. Requires a token that only she holds; with PIPELINE_FORCE_TOKEN
    // unset there is no override to guess at.
    const configuredToken = env.PIPELINE_FORCE_TOKEN ?? '';
    const offeredToken = String(req.body?.token ?? '');
    const forced =
      req.body?.force === true && configuredToken !== '' && offeredToken === configuredToken;
    if (req.body?.force === true && !forced) {
      res.status(403).json({ error: 'force requires a valid token.' });
      return;
    }

    const previous = forced ? null : await newestRun();
    const fresh = previous !== null && Date.now() - previous.at.getTime() < ONE_DAY_MS;
    if (fresh && previous) {
      // The email the run actually sent, kept on its row. Sending these bytes
      // rather than rebuilding the digest means the reused copy cannot quietly
      // differ from the original. A pointer email covers rows written before this
      // was stored, and weeks too large to keep.
      const storedHtml = previous.row['Digest Email HTML'];
      const storedSubject = previous.row['Digest Email Subject'];
      if (storedHtml && storedSubject) {
        await sendEmail({ to: recipient_email, subject: storedSubject, html: storedHtml });
      } else {
        await sendDigestPointer(recipient_email, previous.at);
      }
      recordSend(recipient_email);
      res.json({
        ok: true,
        reused: true,
        emailed: Boolean(storedHtml && storedSubject) ? 'digest' : 'pointer',
        lastRunAt: previous.at.toISOString(),
        weekId: previous.row['Week ID'] ?? null,
        message: 'Showing the most recent analysis.',
      });
      return;
    }
    const result = await runPipeline({ recipient_email, use_mock });
    recordSend(recipient_email);
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
/**
 * Ratings the feedback webhook accepts.
 *
 * "useful"/"not_useful" came from the thumbs in the digest email and stay for
 * those links. The dashboard's action buttons add two more, because rating a
 * recommendation and deciding what to do about it are different questions:
 * "doing" is a commitment, "not_now" is a deferral. Filing a deferral as
 * "not_useful" would tell the next reader the analysis was wrong when the PM
 * only meant "not this week" — and that distinction is the one no tool records.
 *
 * These are values in the existing Rating column, not a new column.
 */
const VALID_RATINGS = new Set(['useful', 'not_useful', 'doing', 'not_now']);

/**
 * The page a PM lands on after clicking a button in the digest email.
 *
 * It used to end with "you can close this tab" on the bare API host — the last
 * thing the product said to them each week was a dead end. It now names what
 * was recorded and offers the way onward, because a click from the email is the
 * single clearest signal that someone is willing to look further.
 */
function thankYouHtml(rating: string, theme_id: string, weekId: string, groupId: string): string {
  const positive = rating === 'doing' || rating === 'useful';
  const RECORDED: Record<string, string> = {
    doing: 'doing this',
    not_now: 'not this week',
    useful: 'useful',
    not_useful: 'not useful',
  };
  const app = (getEnv().APP_BASE_URL ?? 'https://amazon.ritikadas.in').replace(/\/$/, '');
  const params = new URLSearchParams({ week: weekId, ...(groupId ? { group: groupId } : {}) });
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
    <div class="emoji">${positive ? '✓' : '↩'}</div>
    <h1>Recorded</h1>
    <p>Logged as <strong>${RECORDED[rating] ?? rating}</strong>${
      rating === 'not_now'
        ? ', with the week it was deferred in — so the decision is answerable later.'
        : '.'
    }</p>
    <p><code>${theme_id}</code></p>
    <p style="margin-top:24px;">
      <a href="${app}/digest?${params.toString()}" style="display:inline-block;background:#1e293b;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Open the digest</a>
    </p>
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
        'Bad request: theme_id, week_id, and a valid rating (useful|not_useful|doing|not_now) are required.',
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

    res.type('text/html').send(thankYouHtml(rating, theme_id, week_id, feature_group_id));
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

// ─── Chat citation eval (A5 follow-up) ───────────────────────────────────────
// Durable trail for the online eval metric: one row per chat turn that cited at
// least one signal. The client computes resolved/total against the same scoped
// signals it renders, and posts it here. "Chat Evals" sheet columns:
//   Week ID | Feature Group ID | Source | Total Citations | Resolved Citations
//   | Resolution Rate | Message Preview | Created At
app.post('/webhook/chat-eval', async (req: Request, res: Response) => {
  try {
    const total = Number(req.body?.total);
    const resolved = Number(req.body?.resolved);
    if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(resolved) || resolved < 0 || resolved > total) {
      res.status(400).json({
        error: 'total (positive int) and resolved (0..total) are required.',
      });
      return;
    }
    const week_id = String(req.body?.week ?? '').trim();
    const feature_group_id = String(req.body?.group ?? 'all').trim();
    const source = String(req.body?.source ?? '').trim();
    // Rate is derived here, not trusted from the client, so the column is consistent.
    const rate = Math.round((resolved / total) * 100) / 100;
    const preview = String(req.body?.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);

    await appendRows(env.SHEETS_CHAT_EVALS_TAB, [
      {
        'Week ID': week_id,
        'Feature Group ID': feature_group_id,
        Source: source,
        'Total Citations': total,
        'Resolved Citations': resolved,
        'Resolution Rate': rate,
        'Message Preview': preview,
        'Created At': new Date().toISOString(),
      },
    ]);
    res.json({ ok: true, total, resolved, rate });
  } catch (err) {
    console.error('[server] chat-eval failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  console.log(`[server] Listening on http://localhost:${env.PORT}`);
  console.log(
    `[server] Endpoints: GET /health, GET /digests, GET /signals, GET /runs/latest, ` +
      `GET /effort-overrides, GET /webhook/digest-feedback, POST /run-pipeline, ` +
      `POST /webhook/run-pipeline, POST /webhook/set-effort, POST /webhook/chat, ` +
      `POST /webhook/chat-eval`,
  );
});

const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — shutting down.`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
