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

export async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  const env = getEnv();
  const { temperature = 0.1, maxOutputTokens = 8192, thinkingLevel = 'minimal' } = opts;

  const url =
    `https://${env.VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${env.VERTEX_PROJECT_ID}` +
    `/locations/${env.VERTEX_REGION}/publishers/google/models/${env.VERTEX_MODEL}:generateContent`;

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

export function parseJsonOrThrow<T>(cleaned: string, label: string): T {
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`${label}: Vertex AI returned invalid JSON: ${cleaned.substring(0, 200)}`);
  }
}
