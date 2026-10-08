import { escapeText as e } from './word-usage-ui.ts';
import type { Feedback, PracticeSnapshot } from './feedback-contract.ts';

export function feedbackHtml(snapshot: PracticeSnapshot, feedback: Feedback): string {
  const correction = feedback.correction;
  const labels = { independent: 'Zelf gebruikt', supported: 'Met hulp gebruikt', 'needs-practice': 'Nog eens proberen', 'not-used': 'Volgende keer proberen', uncertain: 'Transcript eerst controleren' };
  const transcript = snapshot.turns.map(t => `<p><strong>${t.role === 'user' ? 'Jij' : 'Poortaal'}:</strong> ${e(t.content)}</p>`).join('');
  return `<div class="card-label">Terugblik · ${e(snapshot.word)}</div>
    <div class="use-status">${labels[feedback.assessment]}</div>
    <p>${e(feedback.strength)}</p>
    ${feedback.strength_quote ? `<blockquote>${e(feedback.strength_quote)}</blockquote>` : ''}
    ${correction ? `<div class="word-use"><strong>${correction.kind === 'error' ? 'Eén aandachtspunt' : 'Een natuurlijker alternatief'}</strong>
      <p>Jij: ${e(correction.quote)}</p><p>Zo kan het: <strong>${e(correction.better)}</strong></p>
      <p>${e(correction.explanation)}</p></div>` : ''}
    ${feedback.assessment === 'uncertain' ? '<p>Deze transcriptie is niet zeker genoeg om je gebruik te beoordelen.</p>' : ''}
    <div class="feedback-actions">
      ${feedback.retry_prompt ? '<button type="button" class="use-button" data-feedback="retry">Nog één zin proberen</button>' : ''}
      <button type="button" class="use-button secondary" data-feedback="discard">Dit klopt niet</button>
    </div>
    <div class="feedback-retry" hidden>
      <label>${e(feedback.retry_prompt)}<textarea class="feedback-input" rows="2" placeholder="Typ je zin in het Nederlands..."></textarea></label>
      <div class="feedback-actions"><button type="button" class="use-button" data-feedback="send">Bekijk mijn zin</button>
      <button type="button" class="use-button secondary" data-feedback="example">Een voorbeeld</button></div>
      <p class="feedback-example" hidden>${e(feedback.retry_example)}</p>
    </div>
    <details class="feedback-transcript"><summary>Bekijk je gesprek</summary>${transcript}</details>`;
}
