import { validateWordUsage, WORD_USAGE_RULES } from './word-usage.ts';
import type { ChatMessage, WordExplanation } from './word-explanation.ts';

type CompleteChat = (messages: ChatMessage[], temperature?: number) => Promise<string>;

// Enrich older saved words without regenerating their definitions or examples.
export async function enrichWordUsage(data: WordExplanation, completeChat: CompleteChat): Promise<WordExplanation> {
  if (data.usage !== undefined) return data;
  const raw = await completeChat([
    { role: 'system', content: `You teach everyday A2-B1 Dutch. Return only JSON with a "usage" array. ${WORD_USAGE_RULES}` },
    { role: 'user', content: JSON.stringify({ word: data.word, meaning: data.meaning_en, examples: data.examples }) },
  ], 0.3);
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  return { ...data, usage: validateWordUsage(parsed.usage) };
}
