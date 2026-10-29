import { currentRound, currentTask, practiceOutcome, type StructuredSession } from './structured-session.ts';
import { feedbackView } from './structured-view.ts';
import { escapeText as e } from './word-usage-ui.ts';

const button = (action: string, label: string, busy: boolean) => `<button type="button" class="use-button" data-voice="${action}" ${busy ? 'disabled' : ''}>${label}</button>`;
export function renderVoicePractice(s: StructuredSession, busy: boolean, error: string): string {
  const t = currentTask(s), r = currentRound(s);
  let body = '';
  if (s.phase === 'prepare') body = `<p>Preparing a short conversation…</p>${button('load', 'Try again', busy)}`;
  if (s.phase === 'answer' && t) body = `<p class="structured-step">${s.round ? 'One variation' : 'Your situation'}</p>
    <p>${e(t.situation)}</p><p><strong>Your goal:</strong> ${e(t.task)}</p>
    ${t.hints.slice(0, r.hintsUsed).map((h, i) => `<p class="structured-tip">Hint ${i + 1}: ${e(h)}</p>`).join('')}
    ${button('hint', r.hintsUsed < 3 ? 'Give me a hint' : 'All hints shown', busy || r.hintsUsed >= 3)}
    ${s.pending ? button('feedback', 'Retry feedback', busy) : ''}
    <details><summary>Voice controls</summary><p>Say “hint” for help, “feedback” to review, or “klaar” to finish.</p></details>
    ${r.turns?.length ? '<details><summary>Earlier conversation</summary>' + r.turns.map(t => `<p>${t.role === 'user' ? 'You' : 'Tutor'}: ${e(t.content)}</p>`).join('') + '</details>' : ''}`;
  if (s.phase === 'feedback' && r.feedback) body = `<h3>${practiceOutcome(s) === 'independent' ? 'Used independently' : practiceOutcome(s) === 'supported' ? 'Used with help' : 'Keep practising'}</h3>
    <p>${e(r.feedback.strength.text)}</p>${button('listen', 'Listen to feedback', busy)}
    <details><summary>More feedback</summary>${feedbackView(r.feedback)}</details>
    <div class="structured-actions">${s.round ? button('finish', 'Finish', busy) : button('retry', 'Try a variation', busy) + button('finish', 'Finish here', busy)}</div>`;
  if (s.phase === 'complete') body = `<h3>Practice complete</h3>${button('done', 'Back to your words', busy)}`;
  return `<div class="structured-practice">${error ? `<p role="alert" class="structured-error">${e(error)}</p>` : ''}${busy ? '<p role="status">One moment…</p>' : ''}${body}</div>`;
}
