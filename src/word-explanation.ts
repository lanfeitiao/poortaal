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

  const funFact = value.fun_fact;
  if (funFact !== null && typeof funFact !== 'string') {
    throw new InvalidWordExplanationError('fun_fact must be a string or null');
  }

  return {
    word: requireNonEmptyString(value, 'word'),
    type: requireNonEmptyString(value, 'type'),
    meaning_nl: requireNonEmptyString(value, 'meaning_nl'),
    meaning_en: requireNonEmptyString(value, 'meaning_en'),
    examples,
    tips: requireNonEmptyString(value, 'tips'),
    fun_fact: funFact as string | null,
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
- "meaning_nl": meaning explained in simple Dutch (1-2 sentences)
- "meaning_en": English translation/meaning
- "examples": array of exactly 2 objects with "nl" (Dutch sentence using the word) and "en" (English translation). Tailor these examples to a parent who lives in the Netherlands and has a six-year-old child attending a Montessori school. Use natural, practical sentences they could actually say in daily life—for example while talking to teachers or other parents, dropping off or picking up their child, arranging playdates, shopping, travelling locally, visiting the huisarts, or handling household and neighbourhood routines. Prefer first-person, conversational A2-B1 Dutch and vary the situations; do not force school or parenting into an example when the word does not fit that context naturally
- "tips": one concise, genuinely useful and factually reliable insight in English. Always provide this field so the learner consistently sees a Tips card. Prioritize information that changes how a learner would form or understand a sentence: irregular grammar or inflection, required articles or prepositions, register, idiomatic usage, a common learner error, or a useful contrast with a similar word. For a transparent compound or a word with a meaningful affix, explain its parts only when the analysis is certain and helps the learner remember or infer the meaning. Avoid merely restating the definition, examples, or obvious spelling/capitalization rules. Silently verify every grammatical claim before responding; if you are not confident that a claim is correct, give a simpler, well-established usage tip instead. For verbs, determine separability from the verb's actual conjugation and stress pattern, never merely from its spelling. In particular, Dutch verbs with unstressed prefixes such as be-, ge-, her-, ont-, and ver- are normally inseparable: do not split the prefix and do not add ge- in the past participle. For example, vervangen is inseparable: use "ik vervang" and "ik heb vervangen", never "ik vang ... ver". Do not describe an inseparable verb as separable
- "fun_fact": an interesting etymology or cultural note (in English), or null if nothing notable`;

async function requestWordExplanation(
  word: string,
  completeChat: ChatCompletion,
): Promise<WordExplanation> {
  let raw: string;
  try {
    raw = await completeChat([
      { role: 'system', content: WORD_EXPLANATION_SYSTEM_PROMPT },
      { role: 'user', content: word },
    ]);
  } catch (error) {
    throw new WordExplanationRequestError(error);
  }

  return parseWordExplanation(cleanJsonResponse(raw));
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
