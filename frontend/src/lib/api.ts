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

  setEffort: (theme_id: string, week_id: string, effort: number) =>
    jsonFetch<{ ok: boolean; theme_id: string; week_id: string; effort: number }>(
      '/webhook/set-effort',
      {
        method: 'POST',
        body: JSON.stringify({ theme_id, week_id, effort }),
      },
    ),

  effortOverrides: (weekId: string) =>
    jsonFetch<EffortOverridesResponse>(`/effort-overrides?week=${encodeURIComponent(weekId)}`),
};
