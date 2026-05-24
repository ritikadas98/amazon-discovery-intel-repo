import { callGemini, parseJsonOrThrow } from '../lib/gemini.js';
import type { CleanedSignal, RawSignal } from '../types.js';

interface CleanResult {
  id: number;
  duplicate: boolean;
  irrelevant: boolean;
  severity_score: number;
  version_flagged: boolean;
}

function buildPrompt(signals: Array<{ id: number } & RawSignal>): string {
  return `You are a product discovery analyst. Analyse the following customer signals and return a JSON array.For EACH signal, return:
- id: (same id as input)
- duplicate: true if this signal is nearly identical in meaning to another signal, false otherwise
- irrelevant: true if the signal is vague, spam, non-English, or provides no actionable product insight, false otherwise
- severity_score: a float from 1.0 to 5.0 where 5.0 = critical product-breaking issue, 3.0 = moderate friction, 1.0 = minor or positive feedback
- version_flagged: true if the signal mentions a specific version number (e.g. "5.2", "v5") or phrases like "after the update" / "since the update", false otherwise

RULES:
- severity_score must always be a float between 1.0 and 5.0. Never null, never outside this range.
- Only mark duplicate: true on the LATER of two similar signals (keep the first)
- irrelevant signals still need a severity_score
- Return ONLY a valid JSON array. No markdown, no backticks, no explanation.
- Please make sure the JSON is valid so there are no invalid JSON errors in n8n

FEW-SHOT EXAMPLES:
Input: "App crashes on checkout after update to 5.0, lost my order" -> severity_score: 4.5, version_flagged: true, duplicate: false, irrelevant: false
Input: "ok" -> severity_score: 1.0, irrelevant: true, duplicate: false, version_flagged: false
Input: "Delivery was late by 3 days, no updates from courier" -> severity_score: 3.0, version_flagged: false, duplicate: false, irrelevant: false
Input: "App crashes on checkout, same issue as before" -> severity_score: 4.5, duplicate: true, irrelevant: false, version_flagged: false

SIGNALS TO ANALYSE:
${JSON.stringify(signals, null, 2)}`;
}

/** Agent 1: dedup + irrelevance + severity score + version_flagged. */
export async function cleanSignals(rawSignals: RawSignal[]): Promise<CleanedSignal[]> {
  const indexed = rawSignals.map((s, i) => ({ id: i, ...s }));
  const prompt = buildPrompt(indexed);
  const cleaned = await callGemini(prompt, { temperature: 0.1, thinkingLevel: 'minimal' });
  const results = parseJsonOrThrow<CleanResult[]>(cleaned, 'cleanSignals');

  const out: CleanedSignal[] = [];
  for (const r of results) {
    if (r.duplicate === true) continue;
    if (r.irrelevant === true) continue;
    const original = rawSignals[r.id];
    if (!original) continue;

    const score = parseFloat(String(r.severity_score));
    if (Number.isNaN(score) || score < 1.0 || score > 5.0) {
      throw new Error(`Invalid severity_score for signal ${r.id}: ${r.severity_score}`);
    }

    out.push({
      ...original,
      severity_score: Math.round(score * 10) / 10,
      version_flagged: r.version_flagged === true,
    });
  }

  if (out.length === 0) {
    throw new Error('Zero signals survived cleaning. Check Gemini response.');
  }
  return out;
}
