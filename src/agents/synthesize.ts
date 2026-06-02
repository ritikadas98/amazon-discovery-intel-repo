import { callGeminiJson } from '../lib/gemini.js';
import { config } from '../config/featureGroups.js';
import type { CleanedSignal, TaggedSignal, TrendDirection } from '../types.js';

interface SynthesisTheme {
  theme_id: string;
  theme_label: string;
  trend_direction: TrendDirection;
  signal_ids: number[];
}

interface SignalTag {
  id: number;
  feature_group_id: string;
  theme_id: string;
}

interface SynthesisResponse {
  themes: SynthesisTheme[];
  signal_tags: SignalTag[];
}

function buildPrompt(signals: Array<{ id: number } & CleanedSignal>): string {
  const validIds = config.valid_ids.join(', ');
  return `You are a product discovery analyst for the Amazon Shopping App.

You will perform TWO tasks on the signals below.

---
TASK 1 — THEME CLUSTERING:
Group the signals into 3–6 specific pain themes.
Theme labels must be specific and actionable:
✓ GOOD: "Search price filter resets after scrolling"
✗ BAD: "Search issues"

For each theme return:
- theme_id: t1, t2, t3... (sequential)
- theme_label: specific descriptive label
- trend_direction: "worsening" | "stable" | "improving"
- signal_ids: array of signal ids belonging to this theme

---
TASK 2 — FEATURE GROUP TAGGING:
For every signal, assign exactly one feature_group_id from this list:
${validIds}

RULES:
- ONLY use IDs from the exact list above. Never invent new ones.
- If a signal doesn't fit any group, use "account_performance" as fallback
- One signal = one feature_group_id, no exceptions

FEW-SHOT EXAMPLES:
"App crashes at checkout" → checkout_payment
"Search filters reset when scrolling" → search_discovery
"Prime membership charged twice" → prime_subscriptions
"Package hasn't arrived, tracking not updating" → delivery_tracking
"Product images don't match item received" → product_detail
"Can't log in after update" → account_performance

---
Return ONLY a valid JSON object with this exact structure. No markdown, no backticks:
{
  "themes": [
    {
      "theme_id": "t1",
      "theme_label": "string",
      "trend_direction": "worsening|stable|improving",
      "signal_ids": [0, 1, 2]
    }
  ],
  "signal_tags": [
    {
      "id": 0,
      "feature_group_id": "string",
      "theme_id": "string"
    }
  ]
}

SIGNALS:
${JSON.stringify(signals, null, 2)}`;
}

/** Agent 3: theme clustering + feature_group_id tagging. */
export async function synthesize(cleanedSignals: CleanedSignal[]): Promise<TaggedSignal[]> {
  const indexed = cleanedSignals.map((s, i) => ({ id: i, ...s }));
  const prompt = buildPrompt(indexed);
  // Output includes a tag per signal → raise the budget so larger batches don't
  // truncate. Retry once on a bad parse.
  const parsed = await callGeminiJson<SynthesisResponse>(
    prompt,
    { temperature: 0.2, thinkingLevel: 'minimal', maxOutputTokens: 32768 },
    'synthesize',
  );

  const { themes, signal_tags } = parsed;

  for (const tag of signal_tags) {
    if (!config.valid_ids.includes(tag.feature_group_id)) {
      throw new Error(
        `Invalid feature_group_id "${tag.feature_group_id}" for signal ${tag.id}. Valid IDs: ${config.valid_ids.join(', ')}`,
      );
    }
  }

  const tagLookup: Record<number, SignalTag> = {};
  for (const tag of signal_tags) tagLookup[tag.id] = tag;

  const themeLookup: Record<string, SynthesisTheme> = {};
  for (const t of themes) themeLookup[t.theme_id] = t;

  return cleanedSignals.map((signal, i) => {
    const tag = tagLookup[i];
    const theme = tag ? themeLookup[tag.theme_id] : undefined;
    return {
      ...signal,
      feature_group_id: tag?.feature_group_id || 'account_performance',
      theme_id: tag?.theme_id || 'unclassified',
      theme_label: theme?.theme_label || 'Unclassified',
      trend_direction: theme?.trend_direction || 'stable',
    };
  });
}
