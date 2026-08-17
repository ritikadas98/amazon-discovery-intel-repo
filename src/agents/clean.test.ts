import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { RawSignal, Source } from '../types.js';

const callGeminiJson = vi.fn();
vi.mock('../lib/gemini.js', () => ({
  callGeminiJson: (...args: unknown[]) => callGeminiJson(...args),
}));

const { cleanSignals } = await import('./clean.js');

/**
 * A live run failed with "Zero signals survived cleaning. Check Gemini
 * response." — a message that named four unrelated failures at once, so the
 * operator could not tell which had happened or what to do about it. These
 * tests pin the distinctions, because the whole value of the message is that it
 * points at one cause.
 */

function raw(text: string): RawSignal {
  return {
    text,
    source: 'app_store' as Source,
    date: '2026-08-12',
    rating: 1,
    severity_raw: null,
    app_version: '27.13.0',
  };
}

const signals = [raw('Charged twice for one order'), raw('It will not let me pay')];

beforeEach(() => callGeminiJson.mockReset());

describe('cleanSignals', () => {
  it('keeps the signals the model accepted, with their consequence', async () => {
    callGeminiJson.mockResolvedValueOnce([
      { id: 0, duplicate: false, irrelevant: false, severity_score: 4.0, version_flagged: true, consequence: 'money' },
      { id: 1, duplicate: false, irrelevant: false, severity_score: 3.5, version_flagged: false, consequence: 'blocked' },
    ]);
    const out = await cleanSignals(signals);
    expect(out.signals).toHaveLength(2);
    expect(out.signals.map((s) => s.consequence)).toEqual(['money', 'blocked']);
  });

  it('falls back to the least costly tier for an unknown consequence', async () => {
    callGeminiJson.mockResolvedValueOnce([
      { id: 0, duplicate: false, irrelevant: false, severity_score: 4.0, version_flagged: false, consequence: 'catastrophic' },
    ]);
    const out = await cleanSignals(signals);
    // Never upgrade on bad input — an injection must not promote itself.
    expect(out.signals[0].consequence).toBe('annoyance');
  });

  it('names an all-irrelevant response as a prompt problem, not a data one', async () => {
    callGeminiJson.mockResolvedValueOnce(
      signals.map((_, id) => ({ id, duplicate: false, irrelevant: true, severity_score: 1.0, version_flagged: false, consequence: 'annoyance' })),
    );
    await expect(cleanSignals(signals)).rejects.toThrow(/marked irrelevant.*suspect the prompt/s);
  });

  it('names an empty array as an empty array', async () => {
    callGeminiJson.mockResolvedValueOnce([]);
    await expect(cleanSignals(signals)).rejects.toThrow(/empty array/);
  });

  it('names renumbered ids rather than blaming the response in general', async () => {
    callGeminiJson.mockResolvedValueOnce([
      { id: 900, duplicate: false, irrelevant: false, severity_score: 4.0, version_flagged: false, consequence: 'money' },
    ]);
    await expect(cleanSignals(signals)).rejects.toThrow(/renumbered/);
  });

  it('reports the counts so the failure can be read without a re-run', async () => {
    callGeminiJson.mockResolvedValueOnce([
      { id: 0, duplicate: true, irrelevant: false, severity_score: 4.0, version_flagged: false, consequence: 'money' },
      { id: 1, duplicate: false, irrelevant: true, severity_score: 1.0, version_flagged: false, consequence: 'annoyance' },
    ]);
    await expect(cleanSignals(signals)).rejects.toThrow(
      /2 sent, 2 returned, 1 duplicate, 1 irrelevant, 0 with an unknown id/,
    );
  });

  it('drops an unknown id without failing the whole run', async () => {
    callGeminiJson.mockResolvedValueOnce([
      { id: 0, duplicate: false, irrelevant: false, severity_score: 4.0, version_flagged: false, consequence: 'money' },
      { id: 77, duplicate: false, irrelevant: false, severity_score: 4.0, version_flagged: false, consequence: 'money' },
    ]);
    const out = await cleanSignals(signals);
    expect(out.signals).toHaveLength(1);
  });
});
