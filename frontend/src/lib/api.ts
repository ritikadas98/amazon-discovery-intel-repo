import type {
  DigestRow,
  DigestsResponse,
  EffortOverridesResponse,
  PipelineResult,
  SignalsResponse,
} from '@/types';

const DEFAULT_BASE = 'https://amazon-discovery-34n34tq6za-el.a.run.app';

/**
 * API base URL. Set VITE_API_BASE_URL in .env to override (e.g. for local dev
 * pointing at a local backend on http://localhost:3000).
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? DEFAULT_BASE;

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`API ${res.status}: ${detail.substring(0, 300) || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => jsonFetch<{ status: string; timestamp: string }>('/health'),

  runPipeline: (recipient_email?: string) =>
    jsonFetch<PipelineResult>('/webhook/run-pipeline', {
      method: 'POST',
      body: JSON.stringify(recipient_email ? { recipient_email } : {}),
    }),

  digests: (limit = 10) =>
    jsonFetch<DigestsResponse>(`/digests?limit=${limit}`),

  digestForWeek: (weekId: string) =>
    jsonFetch<DigestsResponse>(`/digests?week=${encodeURIComponent(weekId)}&limit=1`),

  signalsForWeek: (weekId: string, limit = 500) =>
    jsonFetch<SignalsResponse>(`/signals?week=${encodeURIComponent(weekId)}&limit=${limit}`),

  signalsForGroup: (weekId: string, groupId: string, limit = 500) =>
    jsonFetch<SignalsResponse>(
      `/signals?week=${encodeURIComponent(weekId)}&group=${encodeURIComponent(groupId)}&limit=${limit}`,
    ),

  latestRun: () => jsonFetch<DigestRow>('/runs/latest'),

  setEffort: (
    theme_id: string,
    week_id: string,
    effort: number,
    feature_group_id: string,
    set_by?: string,
  ) =>
    jsonFetch<{ ok: boolean; theme_id: string; week_id: string; effort: number }>(
      '/webhook/set-effort',
      {
        method: 'POST',
        body: JSON.stringify({ theme_id, week_id, effort, feature_group_id, set_by }),
      },
    ),

  effortOverrides: (weekId: string) =>
    jsonFetch<EffortOverridesResponse>(`/effort-overrides?week=${encodeURIComponent(weekId)}`),
};

// ─── RAG chat (Track 1) ────────────────────────────────────────────────────
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatStreamRequest {
  message: string;
  history?: ChatTurn[];
  group?: string;
  week?: string;
}

export interface ChatStreamHandlers {
  onToken: (text: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

/**
 * POST /webhook/chat and consume the SSE stream. EventSource is GET-only, so we
 * use fetch + a ReadableStream reader and parse the `event:`/`data:` frames by
 * hand. Token frames carry { text }; an `event: error` frame carries { error };
 * the stream ends with `event: done`. Aborting via handlers.signal is silent.
 */
export async function chatStream(
  body: ChatStreamRequest,
  handlers: ChatStreamHandlers,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/webhook/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: handlers.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    handlers.onError?.(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: string }).error ?? '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    handlers.onError?.(detail || `Chat request failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = 'message';
  let errored = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);

        if (line === '') {
          eventType = 'message'; // blank line = end of one SSE event
          continue;
        }
        if (line.startsWith('event:')) {
          eventType = line.slice('event:'.length).trim();
          continue;
        }
        if (line.startsWith('data:')) {
          const payload = line.slice('data:'.length).trim();
          if (eventType === 'error') {
            errored = true;
            let msg = payload;
            try {
              msg = (JSON.parse(payload) as { error?: string }).error ?? payload;
            } catch {
              /* keep raw */
            }
            handlers.onError?.(msg);
          } else if (eventType !== 'done') {
            try {
              const obj = JSON.parse(payload) as { text?: string };
              if (obj.text) handlers.onToken(obj.text);
            } catch {
              /* ignore non-JSON keep-alive */
            }
          }
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    handlers.onError?.(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!errored) handlers.onDone?.();
}
