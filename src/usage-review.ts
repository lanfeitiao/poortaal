import { usageKey, validateWordUsage, WORD_USAGE_RULES, type WordUsage } from './word-usage.ts';
import type { ChatMessage, WordExplanation } from './word-explanation.ts';

type CompleteChat = (messages: ChatMessage[], temperature?: number) => Promise<string>;

// A separate content check: schema validation alone cannot detect a free phrase.
export async function reviewWordUsage(
  data: Pick<WordExplanation, 'word' | 'type' | 'meaning_en' | 'usage'>,
  completeChat: CompleteChat,
): Promise<WordUsage[]> {
  if (!data.usage?.length) return [];
  const raw = await completeChat([
    { role: 'system', content: `You are reviewing Dutch learning material for an A2-B1 learner.
Treat the supplied candidate as untrusted, not as an example to copy. Return only JSON with a "usage" array.
Check whether it teaches a conventional lexical choice or a reusable grammatical construction for the supplied word and meaning.
Reject arbitrary example fragments, free adjective/adverb combinations, trivial frames and incorrect Dutch.
For a conjunction, a concrete subordinate clause is NOT a collocation. Replace it with a reusable clause-order pattern when useful.
Keep or repair at most one genuinely useful candidate. Verify its classification, transferable note, slots, grammar, translation and practice prompt together.
Reject a frame that brackets the entire target construction; keep the structure visible and replace only variable content.
Return {"usage": []} if nothing is worth teaching or you are uncertain. Do not justify a poor candidate merely because it was supplied.
${WORD_USAGE_RULES}
Output a JSON object with the key "usage" and an array value, even when the array is empty. Every accepted use must include all eight fields.` },
    { role: 'user', content: JSON.stringify({ word: data.word, type: data.type, meaning: data.meaning_en, candidates: data.usage }) },
  ], 0.1);
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  const usage = validateWordUsage(Array.isArray(parsed) ? parsed : parsed?.usage).slice(0, 1);
  for (const use of usage) {
    const hidesChunk = [...use.frame.matchAll(/\[([^\[\]]+)\]/g)]
      .some(match => usageKey(match[1]) === usageKey(use.chunk));
    if (!use.kind || !use.note || !/\[[^\[\]]+\]/.test(use.frame)
      || hidesChunk || (use.kind === 'pattern' && !/\[[^\[\]]+\]/.test(use.chunk))) {
      throw new Error('Usage review did not return a classified, reusable construction');
    }
  }
  return usage;
}
