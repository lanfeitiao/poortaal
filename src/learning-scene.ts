import { validateLearningMoment, validateStudyScenario, type LearningMoment, type StudyScenario } from './structured-contract.ts';
import { generateLearningMoment, containsLessonTarget, validateStudyGrounding, type CompleteChat } from './structured-ai.ts';
import { createSession } from './structured-session.ts';
import { usageKey } from './word-usage.ts';
import type { WordExplanation } from './word-explanation.ts';
import { validateLearningDialogue, validateLearningExchange } from './learning-scene-quality.ts';

export type LearningScene = { version: 6; generatedAt: number; sense: string; usage: string; scenario: StudyScenario; moment: LearningMoment };
export function sceneUsage(data: Pick<WordExplanation, 'word' | 'usage'>): string {
  return usageKey(data.usage?.[0]?.chunk || data.word);
}
export function readLearningScene(value: unknown, data: Pick<WordExplanation, 'word' | 'usage' | 'meaning_en'>): LearningScene | undefined {
  try {
    const v = value as LearningScene;
    if (!v || v.version !== 6 || v.sense !== data.meaning_en || v.usage !== sceneUsage(data)) return;
    if (!Number.isSafeInteger(v.generatedAt) || v.generatedAt < 0) return;
    const scenario = validateStudyScenario(v.scenario);
    validateStudyGrounding(scenario, data.word);
    const moment = validateLearningMoment(v.moment);
    if (!containsLessonTarget(moment.transfer.example, data.word)
      || scenario.situation === moment.transfer.situation
      || scenario.dialogue.some(turn => turn.line === moment.transfer.example)
      || containsLessonTarget(moment.transfer.openingLine, data.word)) return;
    validateLearningDialogue(scenario);
    validateLearningExchange(moment.transfer.openingLine, moment.transfer.example);
    return { version: 6, generatedAt: v.generatedAt, sense: v.sense, usage: v.usage, scenario, moment };
  } catch { return; }
}
export async function generateLearningScene(data: WordExplanation, chat: CompleteChat): Promise<LearningScene> {
  const session = { ...createSession('lesson', data.word, data.usage?.[0], true, true), meaning: data.meaning_en };
  const { scenario, moment } = await generateLearningMoment(session, data.tips, chat);
  return { version: 6, generatedAt: Date.now(), sense: data.meaning_en, usage: sceneUsage(data), scenario, moment };
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
