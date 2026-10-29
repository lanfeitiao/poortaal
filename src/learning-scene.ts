import { validateScenario, type PracticeScenario } from './structured-contract.ts';
import { generateScenario, validateLessonGrounding, type CompleteChat } from './structured-ai.ts';
import { createSession } from './structured-session.ts';
import { usageKey } from './word-usage.ts';
import type { WordExplanation } from './word-explanation.ts';

export type LearningScene = { version: 2; generatedAt: number; sense: string; usage: string; scenario: PracticeScenario };
export function sceneUsage(data: Pick<WordExplanation, 'word' | 'usage'>): string {
  return usageKey(data.usage?.[0]?.chunk || data.word);
}
export function readLearningScene(value: unknown, data: Pick<WordExplanation, 'word' | 'usage' | 'meaning_en'>): LearningScene | undefined {
  try {
    const v = value as LearningScene;
    if (!v || v.version !== 2 || v.sense !== data.meaning_en || v.usage !== sceneUsage(data)) return;
    if (!Number.isSafeInteger(v.generatedAt) || v.generatedAt < 0) return;
    const scenario = validateScenario(v.scenario);
    validateLessonGrounding(scenario, data.word);
    return { version: 2, generatedAt: v.generatedAt, sense: v.sense, usage: v.usage, scenario };
  } catch { return; }
}
export async function generateLearningScene(data: WordExplanation, chat: CompleteChat, previous: string[] = []): Promise<LearningScene> {
  const session = { ...createSession('lesson', data.word, data.usage?.[0], true, true), meaning: data.meaning_en };
  const scenario = await generateScenario(session, previous, chat, true);
  return { version: 2, generatedAt: Date.now(), sense: data.meaning_en, usage: sceneUsage(data), scenario };
}
type Exposure = { word: string; sense: string; usage: string; at: number };
function exposures(owner: string): Exposure[] {
  try {
    const value = JSON.parse(localStorage.getItem(`poortaal_scene_exposure:${owner}`) || '[]');
    return Array.isArray(value) ? value.filter(v => v && typeof v.word === 'string' && typeof v.sense === 'string'
      && typeof v.usage === 'string' && Number.isFinite(v.at)) : [];
  } catch { return []; }
}
export function rememberSceneExposure(data: WordExplanation, owner: string, now = Date.now()): void {
  if (!readLearningScene(data.scene, data)) return;
  const word = usageKey(data.word), seen = exposures(owner).filter(v => v.word !== word).slice(-29);
  try { localStorage.setItem(`poortaal_scene_exposure:${owner}`, JSON.stringify([...seen,
    { word, sense: data.meaning_en, usage: sceneUsage(data), at: now }])); } catch { /* Word learning remains available. */ }
}
export function recentlyViewedScene(data: WordExplanation, owner: string, now = Date.now()): boolean {
  return !!readLearningScene(data.scene, data) && exposures(owner).some(v => v.word === usageKey(data.word)
    && v.sense === data.meaning_en && v.usage === sceneUsage(data) && now >= v.at && now - v.at < 30 * 60_000);
}
