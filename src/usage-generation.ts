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
Select at most one valuable use around the supplied word sense. Its example replaces the displayed sentence, not a separate card. An ordinary adjective/adverb plus an interchangeable action is not a learning chunk. Return an empty list if no word-specific choice or construction is worth teaching.` },
    { role: 'user', content: JSON.stringify({ word: data.word, meaning: data.meaning_en, examples: data.examples }) },
  ], 0.3);
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  return { ...data, usage: validateWordUsage(parsed.usage).slice(0, 1) };
}
