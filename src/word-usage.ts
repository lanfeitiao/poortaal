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

export const WORD_USAGE_RULES = `Include a "usage" array with one or two genuinely useful everyday uses when a reliable collocation OR reusable sentence pattern exists.
Each use has exactly these string fields: chunk, meaning_en, frame, example_nl, example_en, review_prompt.
chunk: a conventional Dutch collocation, short expression, or reusable construction anchored to the target word. It need not be an idiom or an exclusive fixed pairing.
meaning_en: what this combination lets the learner communicate.
frame: a natural A2-B1 sentence with replaceable slots in [brackets].
example_nl and example_en: one natural complete example and its English translation.
review_prompt: a short everyday situation in English inviting the learner to produce this use, without revealing the Dutch answer.
Keep all uses attached to the same target word and sense; preserve required articles, prepositions, reflexive pronouns, and separable-verb forms.
Avoid obscure idioms and invented collocations. Before returning an empty array, consider a simple natural sentence construction; ordinary adjectives and verbs usually have one. Use an empty array only if neither a reliable useful combination nor a sentence construction is available.
For afspraak, possible chunks are "een afspraak maken" and "een afspraak verzetten".
For voorzichtig, useful constructions are "voorzichtig zijn met" (frame: "Ik ben voorzichtig met [iets].") and "voorzichtig rijden" (frame: "Ik rijd voorzichtig omdat [reden].").
Vary situations naturally: school, family, work, shopping, neighbours, and appointments.`;
