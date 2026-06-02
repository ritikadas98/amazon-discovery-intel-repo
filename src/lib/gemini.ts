import { GoogleAuth } from 'google-auth-library';
import type { AuthClient } from 'google-auth-library';
import { getEnv } from '../config/env.js';

export interface GeminiOptions {
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: 'minimal' | 'medium' | 'high';
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

let cachedAuthClient: AuthClient | null = null;

async function getAuthClient(): Promise<AuthClient> {
  if (cachedAuthClient) return cachedAuthClient;
  const env = getEnv();
  const authOpts: { scopes: string[]; keyFile?: string } = {
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  };
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    authOpts.keyFile = env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const auth = new GoogleAuth(authOpts);
  cachedAuthClient = await auth.getClient();
  return cachedAuthClient;
}

function thinkingBudgetFromLevel(level: 'minimal' | 'medium' | 'high'): number {
  switch (level) {
    case 'minimal':
      return 0;
    case 'medium':
      return 4096;
    case 'high':
      return -1; // -1 = dynamic, let the model decide
  }
}

/** Build the Vertex AI model endpoint URL for a given method (e.g. "generateContent"). */
function vertexModelUrl(method: string): string {
  const env = getEnv();
  return (
    `https://${env.VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${env.VERTEX_PROJECT_ID}` +
    `/locations/${env.VERTEX_REGION}/publishers/google/models/${env.VERTEX_MODEL}:${method}`
  );
}

export async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  const { temperature = 0.1, maxOutputTokens = 8192, thinkingLevel = 'minimal' } = opts;

  const url = vertexModelUrl('generateContent');

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      thinkingConfig: {
        thinkingBudget: thinkingBudgetFromLevel(thinkingLevel),
      },
    },
  };

  const client = await getAuthClient();
  const accessToken = (await client.getAccessToken()).token;
  if (!accessToken) {
    throw new Error('Vertex AI auth: GoogleAuth returned no access token.');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI error (${res.status}): ${errText.substring(0, 500)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return rawText.replace(/```json|```/g, '').trim();
}

/**
 * Streaming counterpart to callGemini. Yields plain-text deltas as the model
 * produces them, using Vertex AI's :streamGenerateContent?alt=sse endpoint.
 *
 * Unlike callGemini, this deliberately does NOT set responseMimeType to JSON —
 * chat replies are prose/markdown. Caller is responsible for any framing
 * (e.g. wrapping deltas in SSE for an HTTP response).
 */
export async function* streamGemini(
  prompt: string,
  opts: GeminiOptions = {},
): AsyncGenerator<string> {
  const { temperature = 0.3, maxOutputTokens = 2048, thinkingLevel = 'minimal' } = opts;

  const url = vertexModelUrl('streamGenerateContent') + '?alt=sse';

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      // No responseMimeType — we want free-form text, not JSON.
      thinkingConfig: {
        thinkingBudget: thinkingBudgetFromLevel(thinkingLevel),
      },
    },
  };

  const client = await getAuthClient();
  const accessToken = (await client.getAccessToken()).token;
  if (!accessToken) {
    throw new Error('Vertex AI auth: GoogleAuth returned no access token.');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI stream error (${res.status}): ${errText.substring(0, 500)}`);
  }
  if (!res.body) {
    throw new Error('Vertex AI stream error: response had no body.');
  }

  // Parse the SSE stream: events are separated by blank lines; payload lines
  // start with "data:" and carry a JSON GenerateContentResponse chunk.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice('data:'.length).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload) as GeminiResponse;
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch {
        // Partial / non-JSON keep-alive line — ignore and wait for more.
      }
    }
  }
}

export function parseJsonOrThrow<T>(cleaned: string, label: string): T {
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`${label}: Vertex AI returned invalid JSON: ${cleaned.substring(0, 200)}`);
  }
}

/**
 * callGemini + parseJsonOrThrow with a retry. The model occasionally returns
 * malformed/truncated JSON (LLM nondeterminism); a re-call usually succeeds.
 * Pass a generous maxOutputTokens for large per-signal responses.
 */
export async function callGeminiJson<T>(
  prompt: string,
  opts: GeminiOptions,
  label: string,
  attempts = 2,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const text = await callGemini(prompt, opts);
      return parseJsonOrThrow<T>(text, label);
    } catch (err) {
      lastErr = err;
      console.warn(
        `[gemini] ${label} attempt ${i}/${attempts} failed: ${
          err instanceof Error ? err.message.slice(0, 140) : String(err)
        }`,
      );
    }
  }
  throw lastErr;
}
