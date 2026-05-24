import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { getEnv } from './config/env.js';
import { runPipeline } from './pipeline/run.js';
import { readRows } from './lib/sheets.js';

const env = getEnv();
const app = express();

const corsOrigin =
  env.CORS_ORIGIN === '*'
    ? true
    : env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/run-pipeline', async (req: Request, res: Response) => {
  const recipient_email = (req.body?.recipient_email as string | undefined) || env.DEFAULT_RECIPIENT;
  if (!recipient_email) {
    res.status(400).json({ error: 'recipient_email is required (in body or DEFAULT_RECIPIENT env var)' });
    return;
  }
  try {
    const result = await runPipeline({ recipient_email });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[server] Pipeline failed:', message, stack);
    res.status(500).json({ error: message });
  }
});

app.get('/digests', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '10'), 10) || 10, 1), 100);
    const rows = await readRows(env.SHEETS_DIGESTS_TAB);
    const sorted = rows.sort((a, b) => parseInt(b.row_number, 10) - parseInt(a.row_number, 10));
    res.json({ count: sorted.length, returned: Math.min(sorted.length, limit), rows: sorted.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/signals', async (req: Request, res: Response) => {
  try {
    const week = req.query.week as string | undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '500'), 10) || 500, 1), 5000);
    const rows = await readRows(env.SHEETS_SIGNALS_TAB);
    const filtered = week ? rows.filter((r) => r['Week ID'] === week) : rows;
    const sorted = filtered.sort((a, b) => parseInt(b.row_number, 10) - parseInt(a.row_number, 10));
    res.json({
      count: sorted.length,
      returned: Math.min(sorted.length, limit),
      week: week ?? null,
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

const server = app.listen(env.PORT, () => {
  console.log(`[server] Listening on http://localhost:${env.PORT}`);
  console.log(`[server] Endpoints: GET /health, GET /digests, GET /signals, GET /runs/latest, POST /run-pipeline`);
});

const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — shutting down.`);
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
