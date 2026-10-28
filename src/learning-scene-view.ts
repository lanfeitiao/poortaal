import { readLearningScene } from './learning-scene.ts';
import { escapeText as e } from './word-usage-ui.ts';
import type { WordExplanation } from './word-explanation.ts';

export function renderLearningScene(data: WordExplanation, state?: 'loading' | 'error'): string {
  const lesson = readLearningScene(data.scene, data), use = data.usage?.[0];
  if (!lesson) return `<section class="card structured-practice"><div class="card-label">Leren in een situatie</div>
    <p role="status">${state === 'error' ? 'De situatie kon niet worden geladen. Je woord blijft bewaard.' : 'Een herkenbare situatie voorbereiden…'}</p>
    ${state === 'error' ? `<button type="button" class="use-button" data-action="retry-learning-scene" data-word="${e(data.word)}">Opnieuw laden</button>` : ''}</section>`;
  const s = lesson.scenario;
  return `<section class="card structured-practice"><div class="card-label">${e(data.word)} in een situatie</div>
    <p><strong>Betekenis:</strong> ${e(lesson.sense)}</p>
    <h3>Wanneer gebruik je dit woord?</h3><p>${e(s.situation)}</p>
    <h3>Zinnen met ${e(data.word)}</h3>${s.expressions.map(line => `<div class="example-nl"><span>${e(line)}</span>
      <button type="button" class="ex-tts-btn" data-action="play-example-tts" data-text="${e(line)}" title="Beluisteren">🔊</button></div>`).join('')}
    <h3>Een kort gesprek</h3><p>Zo past het woord in een gesprek. De andere zinnen geven context.</p>
    <div class="structured-dialogue">${s.dialogue.map(d => `<p><strong>${e(d.speaker)}:</strong> ${e(d.line)}</p>`).join('')}</div>
    ${use ? `<p class="example-pattern"><span class="pattern-label">${use.kind === 'collocation' ? 'Vaste combinatie' : 'Zinsbouw'}</span>
      <strong>${e(use.chunk)}</strong>${use.note ? `<span class="use-note">${e(use.note)}</span>` : ''}</p>` : ''}
    ${s.tip ? `<p class="structured-tip">Let op: ${e(s.tip)}</p>` : ''}
    <p>Probeer hierna een andere variant in een gesprek.</p></section>`;
}
