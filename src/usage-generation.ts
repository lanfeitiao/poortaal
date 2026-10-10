import { validateWordUsage, WORD_USAGE_RULES } from './word-usage.ts';
import type { ChatMessage, WordExplanation } from './word-explanation.ts';

type CompleteChat = (messages: ChatMessage[], temperature?: number) => Promise<string>;

export function mergeUsageEnrichment(latest: WordExplanation, generated: Pick<WordExplanation, 'usage'>, retried?: WordExplanation): WordExplanation {
  if (retried && JSON.stringify(latest.usage) === JSON.stringify(retried.usage)) return { ...latest, usage: generated.usage };
  return { ...latest, usage: latest.usage ?? generated.usage };
}

// Enrich older saved words without regenerating their definitions or examples.
export async function enrichWordUsage(data: WordExplanation, completeChat: CompleteChat, retryEmpty = false): Promise<WordExplanation> {
  if (data.usage !== undefined && (!retryEmpty || data.usage.length)) return data;
  const raw = await completeChat([
    { role: 'system', content: `You teach everyday A2-B1 Dutch. Return only JSON with a "usage" array. ${WORD_USAGE_RULES}
Build the uses around the supplied example situations where natural. The usage examples will replace the corresponding displayed example, not appear as a separate card. Preserve the word sense. For ordinary useful words, look for a simple reusable sentence pattern before choosing an empty list; never invent a collocation just to fill it.` },
    { role: 'user', content: JSON.stringify({ word: data.word, meaning: data.meaning_en, examples: data.examples }) },
  ], 0.3);
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  return { ...data, usage: validateWordUsage(parsed.usage) };
}
