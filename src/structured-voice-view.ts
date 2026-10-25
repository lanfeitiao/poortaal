import { currentRound, currentTask, practiceOutcome, type StructuredSession } from './structured-session.ts';
import { feedbackView } from './structured-view.ts';
import { escapeText as e } from './word-usage-ui.ts';

const button = (action: string, label: string, busy: boolean) => `<button type="button" class="use-button" data-voice="${action}" ${busy ? 'disabled' : ''}>${label}</button>`;
export function renderVoicePractice(s: StructuredSession, busy: boolean, error: string): string {
  const t = currentTask(s), r = currentRound(s);
  let body = '';
  if (s.phase === 'prepare') body = `<p>Een korte gesprekssituatie voorbereiden…</p>${button('load', 'Opnieuw laden', busy)}`;
  if (s.phase === 'answer' && t) body = `<p class="structured-step">${s.round ? 'Nog één keer · nieuwe voorwaarde' : 'Probeer het eerst zelf'}</p>
    <p>${e(t.situation)}</p><p><strong>Je wilt:</strong> ${e(t.task)}</p>
    <p>Spreek met je gesprekspartner. Je kunt “hint”, “feedback” of “klaar” zeggen.</p>
    ${t.hints.slice(0, r.hintsUsed).map((h, i) => `<p class="structured-tip">Hint ${i + 1}: ${e(h)}</p>`).join('')}
    ${button('hint', r.hintsUsed < 3 ? 'Een hint' : 'Alle hints bekeken', busy || r.hintsUsed >= 3)}
    ${s.pending ? button('feedback', 'Feedback opnieuw ophalen', busy) : ''}
    ${r.turns?.length ? '<details><summary>Vorige woorden bekijken</summary>' + r.turns.map(t => `<p>${t.role === 'user' ? 'Jij' : 'Tutor'}: ${e(t.content)}</p>`).join('') + '</details>' : ''}`;
  if (s.phase === 'feedback' && r.feedback) body = `<h3>Kort terugkijken</h3><p>Je antwoord is bewaard. ${practiceOutcome(s) === 'independent' ? 'Zelfstandig gelukt.' : practiceOutcome(s) === 'supported' ? 'Gelukt met hulp.' : 'Nog oefenen.'}</p>
    <p>${e(r.feedback.strength.text)}</p>${button('listen', 'Feedback beluisteren', busy)}
    <details><summary>Alle feedback bekijken</summary>${feedbackView(r.feedback)}</details>
    <p>${s.round ? 'Zeg “klaar” om af te ronden.' : 'Zeg “nog een keer” of “klaar”.'}</p>
    <div class="structured-actions">${s.round ? button('finish', 'Afronden', busy) : button('retry', 'Nog één variant', busy) + button('finish', 'Afronden zonder retry', busy)}</div>`;
  if (s.phase === 'complete') body = `<h3>Goed geoefend met “${e(s.word)}”</h3><p>Je antwoorden, hulp en leerresultaten zijn bewaard.</p>${button('done', 'Terug naar je woorden', busy)}`;
  return `<div class="structured-practice">${error ? `<p role="alert" class="structured-error">${e(error)}</p>` : ''}${busy ? '<p role="status">Even verwerken…</p>' : ''}${body}</div>`;
}
