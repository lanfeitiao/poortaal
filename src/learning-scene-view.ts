import { readLearningScene } from './learning-scene.ts';
import { escapeText as e } from './word-usage-ui.ts';
import type { WordExplanation } from './word-explanation.ts';

export function renderLearningScene(data: WordExplanation, state?: 'loading' | 'error'): string {
  const lesson = readLearningScene(data.scene, data), use = data.usage?.[0];
  if (!lesson) return `<section class="card structured-practice"><div class="card-label">Try it in real life</div>
    <p role="status">${state === 'error' ? 'Could not load a situation. Your word is saved.' : 'Preparing a familiar situation…'}</p>
    ${state === 'error' ? `<button type="button" class="use-button" data-action="retry-learning-scene" data-word="${e(data.word)}">Try again</button>` : ''}</section>`;
  const s = lesson.scenario;
  const line = (text: string) => `<div class="example-nl"><span>${e(text)}</span>
    <button type="button" class="ex-tts-btn" data-action="play-example-tts" data-text="${e(text)}" title="Listen">🔊</button></div>`;
  const extra = s.expressions.slice(1).map(line).join('')
    + (use?.note ? `<p class="use-note">${e(use.note)}</p>` : '')
    + (s.tip ? `<p class="structured-tip">${e(s.tip)}</p>` : '');
  return `<section class="card structured-practice learning-scene"><div class="card-label">Try it in real life</div>
    <p>${e(s.situation)}</p><p><strong>Your goal:</strong> ${e(s.task)}</p>
    <h3>One useful line</h3>${line(s.expressions[0])}
    ${extra ? `<details class="scene-help"><summary>More help</summary>${extra}</details>` : ''}
    <div class="structured-actions"><button type="button" class="use-button" data-action="practice-word" data-word="${e(data.word)}" ${state === 'loading' ? 'disabled' : ''}>Start conversation</button>
    <button type="button" class="use-button secondary" data-action="change-learning-scene" data-word="${e(data.word)}" ${state === 'loading' ? 'disabled' : ''}>${state === 'loading' ? 'Changing situation…' : 'Different situation'}</button></div>
    ${state === 'error' ? '<p role="status">Could not change the situation. Try again.</p>' : ''}</section>`;
}
