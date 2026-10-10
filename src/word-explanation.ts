import { validateWordUsage, WORD_USAGE_RULES, type WordUsage } from './word-usage.ts';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type WordExample = {
  nl: string;
  en: string;
};

export type WordExplanation = {
  word: string;
  type: string;
  meaning_nl: string;
  meaning_en: string;
  examples: [WordExample, WordExample];
  tips: string;
  fun_fact: string | null;
  usage?: WordUsage[];
};

type ChatCompletion = (
  messages: ChatMessage[],
  temperature?: number,
) => Promise<string>;

export class WordExplanationRequestError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super('API error');
    this.name = 'WordExplanationRequestError';
    this.originalError = originalError;
  }
}

export class InvalidWordExplanationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWordExplanationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(
  data: Record<string, unknown>,
  field: string,
): string {
  const value = data[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidWordExplanationError(`Invalid or missing field: ${field}`);
  }
  return value;
}

export function validateWordExplanation(value: unknown): WordExplanation {
  if (!isRecord(value)) {
    throw new InvalidWordExplanationError('Word explanation must be an object');
  }

  if (!Array.isArray(value.examples) || value.examples.length !== 2) {
    throw new InvalidWordExplanationError('examples must contain exactly 2 items');
  }

  const examples = value.examples.map((example, index) => {
    if (!isRecord(example)) {
      throw new InvalidWordExplanationError(`examples[${index}] must be an object`);
    }
    return {
      nl: requireNonEmptyString(example, 'nl'),
      en: requireNonEmptyString(example, 'en'),
    };
  }) as [WordExample, WordExample];

  const funFact = value.fun_fact ?? null;
  if (funFact !== null && typeof funFact !== 'string') {
    throw new InvalidWordExplanationError('fun_fact must be a string or null');
  }

  let usage: WordUsage[] | undefined;
  if (value.usage !== undefined) {
    try { usage = validateWordUsage(value.usage); }
    catch { throw new InvalidWordExplanationError('Invalid word usage'); }
  }

  return {
    word: requireNonEmptyString(value, 'word'),
    type: requireNonEmptyString(value, 'type'),
    meaning_nl: requireNonEmptyString(value, 'meaning_nl'),
    meaning_en: requireNonEmptyString(value, 'meaning_en'),
    examples,
    tips: value.tips == null ? '' : typeof value.tips === 'string' ? value.tips.trim() : requireNonEmptyString(value, 'tips'),
    fun_fact: funFact as string | null,
    ...(usage === undefined ? {} : { usage }),
  };
}

function parseWordExplanation(raw: string): WordExplanation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InvalidWordExplanationError('AI response was not valid JSON');
  }
  return validateWordExplanation(parsed);
}

export function readSavedWordExplanation(value: unknown): WordExplanation | undefined {
  try { return validateWordExplanation(value); }
  catch { return undefined; }
}

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');
  }
  return cleaned;
}

const WORD_EXPLANATION_SYSTEM_PROMPT = `You are a friendly, knowledgeable Dutch language tutor. The user will give you a Dutch word. Respond with ONLY valid JSON (no markdown, no code fences) with these fields:
- "word": the word
- "type": part of speech in Dutch (e.g. "bijvoeglijk naamwoord", "zelfstandig naamwoord", "werkwoord")
- "meaning_nl": explain only the core meaning in simple Dutch (1 short sentence). Do not include word formation, origin, grammar advice, or usage warnings here
- "meaning_en": a concise English translation of the core meaning, not a second explanation
- "examples": array of exactly 2 objects with "nl" (Dutch sentence using the word) and "en" (English translation). Tailor these examples to a parent who lives in the Netherlands and has a six-year-old child attending a Montessori school. Use natural, practical sentences they could actually say in daily life—for example while talking to teachers or other parents, dropping off or picking up their child, arranging playdates, shopping, travelling locally, visiting the huisarts, or handling household and neighbourhood routines. Prefer first-person, conversational A2-B1 Dutch and vary the situations; do not force school or parenting into an example when the word does not fit that context naturally
- "tips": one concise, genuinely useful and factually reliable insight in English. Always provide this field so the learner consistently sees a Tips card. Prioritize information that changes how a learner would form or understand a sentence: irregular grammar or inflection, required articles or prepositions, register, idiomatic usage, a common learner error, or a useful contrast with a similar word. For a transparent compound or a word with a meaningful affix, explain its parts only when the analysis is certain and helps the learner remember or infer the meaning. Avoid merely restating the definition, examples, or obvious spelling/capitalization rules. Silently verify every grammatical claim before responding; if you are not confident that a claim is correct, give a simpler, well-established usage tip instead. For verbs, determine separability from the verb's actual conjugation, stress pattern, and morphological structure, never merely from the first letters of the spelling. Unstressed prefixes such as be-, ge-, her-, ont-, and ver- are normally inseparable when they are actually the verb's prefix: do not split such a prefix and do not add ge- in the past participle. But a verb that happens to begin with those letters can still be separable when a larger stressed element is the particle. For example, vervangen is inseparable: use "ik vervang" and "ik heb vervangen", never "ik vang ... ver". In contrast, bezighouden is separable because the particle is "bezig", not the prefix "be-": use "ik houd me bezig" and "ik heb me beziggehouden". Do not infer separability or inseparability from spelling alone
- "fun_fact": an optional reliable memory clue in English: transparent word formation, a meaningful affix, or a firmly established etymology. Never guess origins from spelling. Use null when uncertain or unhelpful; no generic trivia

The tips instruction above is constrained by these final rules: tips is an OPTIONAL usage warning, not a required filler card. Return null if no distinct actionable warning is useful. Keep it to one short English sentence about a likely mistake, contrast, or required grammar. Do not repeat meaning, highlighted collocations, or word formation; word formation belongs only in fun_fact.
Return usage in this same response. For each attached usage, make examples[index] identical to its example_nl/example_en, so the sentence and reusable frame teach one coherent use. Do not add separate extra examples.`;

async function requestWordExplanation(
  word: string,
  completeChat: ChatCompletion,
): Promise<WordExplanation> {
  let raw: string;
  try {
    raw = await completeChat([
      { role: 'system', content: `${WORD_EXPLANATION_SYSTEM_PROMPT}\n${WORD_USAGE_RULES}` },
      { role: 'user', content: word },
    ]);
  } catch (error) {
    throw new WordExplanationRequestError(error);
  }

  const data = parseWordExplanation(cleanJsonResponse(raw));
  if (data.usage === undefined) throw new InvalidWordExplanationError('Missing word usage');
  return data;
}

export async function generateWordExplanation(
  word: string,
  completeChat: ChatCompletion,
): Promise<WordExplanation> {
  try {
    return await requestWordExplanation(word, completeChat);
  } catch (error) {
    if (!(error instanceof InvalidWordExplanationError)) throw error;
  }

  return requestWordExplanation(word, completeChat);
}
