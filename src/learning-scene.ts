import { validateScenario, type PracticeScenario } from './structured-contract.ts';
import { generateScenario, type CompleteChat } from './structured-ai.ts';
import { createSession } from './structured-session.ts';
import { usageKey } from './word-usage.ts';
import type { WordExplanation } from './word-explanation.ts';

export type LearningScene = { sense: string; usage: string; scenario: PracticeScenario };
export function sceneUsage(data: Pick<WordExplanation, 'word' | 'usage'>): string {
  return usageKey(data.usage?.[0]?.chunk || data.word);
}
export function readLearningScene(value: unknown, data: Pick<WordExplanation, 'word' | 'usage' | 'meaning_en'>): LearningScene | undefined {
  try {
    const v = value as LearningScene;
    if (!v || v.sense !== data.meaning_en || v.usage !== sceneUsage(data)) return;
    return { sense: v.sense, usage: v.usage, scenario: validateScenario(v.scenario) };
  } catch { return; }
}
export async function generateLearningScene(data: WordExplanation, chat: CompleteChat): Promise<LearningScene> {
  const session = { ...createSession('lesson', data.word, data.usage?.[0], true, true), meaning: data.meaning_en };
  return { sense: data.meaning_en, usage: sceneUsage(data), scenario: await generateScenario(session, [], chat) };
}
