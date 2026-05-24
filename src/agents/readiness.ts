import { callGemini, parseJsonOrThrow } from '../lib/gemini.js';
import { config } from '../config/featureGroups.js';
import type { ReadinessResult, ScoredGroup, Theme, CriteriaLevel, Readiness } from '../types.js';

const VALID_READINESS: Readiness[] = ['READY', 'NEEDS_MORE_EVIDENCE', 'BLOCKED'];
const VALID_CRITERIA: CriteriaLevel[] = ['strong', 'moderate', 'weak'];

function buildPrompt(groupName: string, groupId: string, themes: Theme[]): string {
  const themesForPrompt = themes.map((t) => ({
    theme_id: t.theme_id,
    theme_label: t.theme_label,
    trend_direction: t.trend_direction,
    signal_count: t.signals.length,
    sample_signals: t.signals.slice(0, 3).map((s) => ({
      text: s.text,
      severity_score: s.severity_score,
      source: s.source,
      version_flagged: s.version_flagged,
    })),
  }));

  return `You are a senior product discovery analyst for the Amazon Shopping App.

You are evaluating the discovery readiness of the feature group: "${groupName}"

For EACH theme below, evaluate it against these 4 evidence quality criteria:

1. SIGNAL_VOLUME: Are there enough signals to act on? (threshold: 3+ signals = strong, 2 = moderate, 1 = weak)
2. SOURCE_DIVERSITY: Do signals come from multiple sources? (app_store + play_store + amazon_review = strong, 2 sources = moderate, 1 source = weak)
3. SEVERITY_CONSISTENCY: Are severity scores consistently high? (avg 4.0+ = strong, 3.0-3.9 = moderate, below 3.0 = weak)
4. TREND_SIGNAL: Is the trend worsening or stable with high severity? (worsening = strong, stable = moderate, improving = weak)

Based on these criteria, assign each theme one of:
- READY: 3 or 4 criteria are strong — enough evidence to move to solution discovery
- NEEDS_MORE_EVIDENCE: 2 criteria are strong — promising but needs more data
- BLOCKED: 0 or 1 criteria are strong — insufficient evidence to prioritise

Return ONLY a valid JSON object with this exact structure. No markdown, no backticks:
{
  "group_id": "${groupId}",
  "overall_readiness": "READY | NEEDS_MORE_EVIDENCE | BLOCKED",
  "readiness_summary": "one sentence summary of overall readiness",
  "themes": [
    {
      "theme_id": "string",
      "theme_label": "string",
      "readiness": "READY | NEEDS_MORE_EVIDENCE | BLOCKED",
      "criteria": {
        "signal_volume": "strong | moderate | weak",
        "source_diversity": "strong | moderate | weak",
        "severity_consistency": "strong | moderate | weak",
        "trend_signal": "strong | moderate | weak"
      },
      "gap_reasons": ["string"],
      "recommended_next_steps": ["string"]
    }
  ]
}

THEMES TO EVALUATE:
${JSON.stringify(themesForPrompt, null, 2)}`;
}

export interface AssessReadinessInput {
  topGroup: ScoredGroup;
  themesOfTopGroup: Theme[];
}

export interface AssessReadinessOutput {
  readiness: ReadinessResult;
  themesReady: number;
  themesBlocked: number;
}

/** Agent 5: READY / NEEDS_MORE_EVIDENCE / BLOCKED on the top group. */
export async function assessReadiness(input: AssessReadinessInput): Promise<AssessReadinessOutput> {
  const { topGroup, themesOfTopGroup } = input;
  const groupName =
    config.feature_groups.find((g) => g.id === topGroup.feature_group_id)?.name ?? topGroup.feature_group_id;

  const prompt = buildPrompt(groupName, topGroup.feature_group_id, themesOfTopGroup);
  const cleaned = await callGemini(prompt, { temperature: 0.1, thinkingLevel: 'medium' });
  const parsed = parseJsonOrThrow<ReadinessResult>(cleaned, 'assessReadiness');

  if (!VALID_READINESS.includes(parsed.overall_readiness)) {
    throw new Error(`Invalid overall_readiness: ${parsed.overall_readiness}`);
  }
  for (const theme of parsed.themes) {
    if (!VALID_READINESS.includes(theme.readiness)) {
      throw new Error(`Invalid readiness for theme ${theme.theme_id}: ${theme.readiness}`);
    }
    for (const [key, val] of Object.entries(theme.criteria)) {
      if (!VALID_CRITERIA.includes(val as CriteriaLevel)) {
        throw new Error(`Invalid criteria value for ${key}: ${val}`);
      }
    }
  }

  return {
    readiness: parsed,
    themesReady: parsed.themes.filter((t) => t.readiness === 'READY').length,
    themesBlocked: parsed.themes.filter((t) => t.readiness === 'BLOCKED').length,
  };
}
