import { getEnv } from '../config/env.js';

const MODEL = 'gemini-3.1-flash-lite-preview';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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

export async function callGemini(prompt: string, opts: GeminiOptions = {}): Promise<string> {
  const env = getEnv();
  const { temperature = 0.1, maxOutputTokens = 8192, thinkingLevel = 'minimal' } = opts;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      response_mime_type: 'application/json',
      thinking_config: { thinking_level: thinkingLevel },
    },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.substring(0, 500)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return rawText.replace(/```json|```/g, '').trim();
}

export function parseJsonOrThrow<T>(cleaned: string, label: string): T {
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`${label}: Gemini returned invalid JSON: ${cleaned.substring(0, 200)}`);
  }
}
