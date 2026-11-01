import { readLearningScene } from './learning-scene.ts';
import { escapeText as e } from './word-usage-ui.ts';
import type { WordExplanation } from './word-explanation.ts';

export function renderLearningScene(data: WordExplanation, state?: 'loading' | 'error'): string {
  const lesson = readLearningScene(data.scene, data);
  if (!lesson) return `<section class="card structured-practice"><div class="card-label">Try it in real life</div>
    <p role="status">${state === 'error' ? 'Could not load a situation. Your word is saved.' : 'Preparing a familiar situation…'}</p>
    ${state === 'error' ? `<button type="button" class="use-button" data-action="retry-learning-scene" data-word="${e(data.word)}">Try again</button>` : ''}</section>`;
  const s = lesson.scenario, m = lesson.moment;
  const line = (text: string) => `<div class="example-nl"><span>${e(text)}</span>
    <button type="button" class="ex-tts-btn" data-action="play-example-tts" data-text="${e(text)}" title="Listen" aria-label="Listen to Dutch sentence">🔊</button></div>`;
  return `<section class="card structured-practice learning-scene"><div class="card-label">Try it in real life</div>
    <h3>See it naturally</h3>
    <p class="learning-context">${e(s.situation)}</p>
    <div class="learning-bubble learning-partner"><span class="learning-role">Other person</span>${line(s.openingLine!)}</div>
    <div class="learning-bubble learning-you"><span class="learning-role">You could say</span>
      ${line(s.expressions[0])}<p class="learning-translation">${e(m.translation)}</p></div>
    ${m.notice ? `<div class="learning-notice"><strong>Notice</strong><p>${e(m.notice)}</p></div>` : ''}
    <div class="learning-transfer">
      <h3>Make it yours</h3>
      <p>${e(m.transfer.situation)}</p>
      <div class="learning-bubble learning-partner"><span class="learning-role">Other person</span>${line(m.transfer.openingLine)}</div>
      <label for="learning-try-answer">What would you say in Dutch?</label>
      <textarea id="learning-try-answer" rows="2" maxlength="600" spellcheck="false" placeholder="Try your own reply…"></textarea>
      <details class="learning-transfer-answer"><summary>Compare with one possible reply</summary>
        ${line(m.transfer.example)}<p class="learning-translation">This is one possible answer, not an automatic correction.</p></details>
    </div>
    <div class="structured-actions"><button type="button" class="use-button" data-action="practice-word" data-word="${e(data.word)}" ${state === 'loading' ? 'disabled' : ''}>Start conversation</button>
    <button type="button" class="use-button secondary" data-action="change-learning-scene" data-word="${e(data.word)}" ${state === 'loading' ? 'disabled' : ''}>${state === 'loading' ? 'Changing situation…' : 'Different situation'}</button></div>
    ${state === 'error' ? '<p role="status">Could not change the situation. Try again.</p>' : ''}</section>`;
}
