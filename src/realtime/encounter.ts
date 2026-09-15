import { requestOpenAIChat } from '../openai-client.ts';
import type { Encounter } from './types.ts';

const API_BASE = 'https://poortaal-api.weilin1990.workers.dev';

type GeneratedEncounter = Omit<Encounter, 'id' | 'targetWord'>;

const SYSTEM_PROMPT = `You design tiny spoken Dutch practice encounters for Poortaal, a language-learning app.

Given one Dutch target word or expression, create a concrete everyday situation in which a learner could naturally use it.

Rules:
- The encounter should feel like a real situation, not an exercise about the word.
- Give the learner a clear role, context, and reason to speak.
- Keep the setup short: 1-2 sentences in simple English.
- The openingLine is what the Dutch conversation partner says first. It must naturally invite a response where the target can be used, but must NOT mention or teach the target word.
- Do not ask "are you ready?" and do not talk about practising vocabulary.
- Keep the conversation achievable for an A2-B1 Dutch learner.
- Support should progress from a semantic hint to pieces, a sentence frame, then a natural model sentence.
- For separable verbs, chunks and frame should reflect the form needed in this situation.
- title: short English situation title.
- emoji: exactly one relevant emoji.
- objective: one short English sentence describing what the learner should communicate, without telling them to "use the word".
- Return ONLY valid JSON, with exactly this shape:
{"title":"...","emoji":"...","setup":"...","objective":"...","openingLine":"...","support":{"meaning":"...","chunks":["..."],"frame":"...","model":"..."}}`;

function fallbackEncounter(targetWord: string): Encounter {
  return {
    id: `encounter-${Date.now()}`,
    targetWord,
    title: 'A quick conversation',
    emoji: '💬',
    setup: 'You are having a short everyday conversation.',
    objective: `Express an idea where “${targetWord}” fits naturally.`,
    openingLine: 'Vertel eens, wat is er gebeurd?',
    support: {
      meaning: `Think about what “${targetWord}” lets you express.`,
      chunks: [targetWord],
      frame: `Maak een korte zin met “${targetWord}”.`,
      model: `Gebruik “${targetWord}” in een natuurlijke zin.`,
    },
  };
}

function parseGeneratedEncounter(content: string): GeneratedEncounter | null {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const value = JSON.parse(cleaned) as Record<string, unknown>;
    const support = value.support as Record<string, unknown> | undefined;
    if (
      typeof value.title !== 'string' ||
      typeof value.emoji !== 'string' ||
      typeof value.setup !== 'string' ||
      typeof value.objective !== 'string' ||
      typeof value.openingLine !== 'string' ||
      !support ||
      typeof support.meaning !== 'string' ||
      !Array.isArray(support.chunks) ||
      !support.chunks.every(chunk => typeof chunk === 'string') ||
      typeof support.frame !== 'string' ||
      typeof support.model !== 'string'
    ) return null;

    // Copy only the fields the app trusts. Extra model-generated keys such as
    // id or targetWord must never override learner-selected state.
    return {
      title: value.title,
      emoji: value.emoji,
      setup: value.setup,
      objective: value.objective,
      openingLine: value.openingLine,
      support: {
        meaning: support.meaning,
        chunks: support.chunks as string[],
        frame: support.frame,
        model: support.model,
      },
    };
  } catch {
    return null;
  }
}

export async function createGeneratedEncounter(targetWord: string): Promise<Encounter> {
  try {
    const content = await requestOpenAIChat(
      API_BASE,
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Target: ${targetWord}` },
      ],
      0.8,
    );
    const generated = parseGeneratedEncounter(content);
    if (!generated) return fallbackEncounter(targetWord);

    return {
      ...generated,
      id: `encounter-${Date.now()}`,
      targetWord,
    };
  } catch (error) {
    console.error('Could not generate encounter:', error);
    return fallbackEncounter(targetWord);
  }
}
