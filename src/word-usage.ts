export type WordUsage = {
  chunk: string;
  meaning_en: string;
  frame: string;
  example_nl: string;
  example_en: string;
  review_prompt: string;
};

export function usageKey(chunk: string): string {
  return chunk.toLocaleLowerCase('nl-NL').trim().replace(/\s+/g, ' ');
}

export function validateWordUsage(value: unknown): WordUsage[] {
  if (!Array.isArray(value) || value.length > 2) throw new Error('Invalid word usage');
  const fields = ['chunk', 'meaning_en', 'frame', 'example_nl', 'example_en', 'review_prompt'] as const;
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid word usage');
    const result = {} as WordUsage;
    for (const field of fields) {
      const text = (item as Record<string, unknown>)[field];
      if (typeof text !== 'string' || !text.trim() || text.length > 500) {
        throw new Error(`Invalid word usage ${field}`);
      }
      result[field] = text.trim();
    }
    const key = usageKey(result.chunk);
    if (seen.has(key)) throw new Error('Duplicate word usage');
    seen.add(key);
    return result;
  });
}

export const WORD_USAGE_RULES = `Include a "usage" array with ZERO or ONE carefully selected everyday use. Quality matters, not filling a quota.
Each use has exactly these string fields: chunk, meaning_en, frame, example_nl, example_en, review_prompt.
chunk: a conventional collocation or word-specific construction worth learning as a unit because of a preferred verb, preposition, reflexive form, idiomatic meaning, or non-obvious syntax. Do not promote a free combination of an adjective/adverb and an interchangeable action to a special learning chunk.
meaning_en: what this combination lets the learner communicate.
frame: a natural A2-B1 sentence with replaceable slots in [brackets].
example_nl and example_en: one natural complete example and its English translation.
review_prompt: a short everyday situation in English inviting the learner to produce this use, without revealing the Dutch answer.
Keep all uses attached to the same target word and sense; preserve required articles, prepositions, reflexive pronouns, and separable-verb forms.
Avoid obscure idioms and invented collocations. Return [] if no genuinely useful word-specific pattern exists; this is a successful result, not a generation failure. Never turn a generic sentence into a frame merely by replacing its reason, time or place with a bracketed slot.
For afspraak, select "een afspraak maken": the conventional verb choice maken is useful to learn.
For voorzichtig, "voorzichtig zijn met [iets]" can teach the construction with met. "voorzichtig rijden" is just an ordinary free combination; keep it only as a plain example, not a chunk. "Ik rijd voorzichtig omdat [reden]." teaches no word-specific pattern.
Vary situations naturally: school, family, work, shopping, neighbours, and appointments.`;
