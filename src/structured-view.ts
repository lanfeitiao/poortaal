import { currentRound, currentTask, practiceOutcome, type StructuredSession } from './structured-session.ts';
import type { StructuredFeedback } from './structured-contract.ts';
import { escapeText as e } from './word-usage-ui.ts';

const outcomeLabels = { independent: 'Used independently', supported: 'Used with help', 'needs-practice': 'Keep practising', 'self-reviewed': 'Reviewed' };
function button(action: string, label: string, disabled = false): string {
  return `<button type="button" class="use-button" data-structured="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}
export function feedbackView(f: StructuredFeedback): string {
  const tasks = { completed: 'Goal reached.', partial: 'Partly reached.', 'not-yet': 'Not reached yet.' };
  const targets = { correct: 'Used correctly.', incorrect: 'Needs a correction.', 'not-used': 'Not used yet.', uncertain: 'Not enough clear evidence.' };
  const natural = { natural: 'Sounds natural.', understandable: 'Understandable.', unclear: 'Not clear yet.' };
  return `<div class="structured-feedback"><h3>What worked</h3><p>${e(f.strength.text)}</p>
    ${f.strength.quote ? `<blockquote>${e(f.strength.quote)}</blockquote>` : ''}
    <dl><dt>Your goal</dt><dd>${tasks[f.task]}</dd><dt>Target word</dt><dd>${targets[f.target]}</dd>
    <dt>Your Dutch</dt><dd>${natural[f.naturalness]}</dd></dl>
    ${f.improvement ? `<h3>${f.improvement.kind === 'error' ? 'One improvement' : 'Another natural option (your version also works)'}</h3>
      <p>You said: “${e(f.improvement.quote)}”</p><p>Try: ${e(f.improvement.better)}</p><p>${e(f.improvement.explanation)}</p>` : ''}</div>`;
}
export function renderStructured(session: StructuredSession | null, busy: boolean, error: string): string {
  const notice = `<p class="structured-error" role="alert">${e(error)}</p>`;
  if (!session) return `${notice}<p>Choose a word to practise.</p>`;
  const s = session, round = currentRound(s), task = currentTask(s);
  const heading = `<p class="structured-step">${s.mode === 'guided' ? 'With an example' : 'Try it yourself'} · ${s.round === 0 ? 'First try' : 'One more try'}</p>
    <h2>Practise “${e(s.word)}”</h2>`;
  const state = busy || s.pending ? `<p class="structured-status" role="status">${busy ? 'One moment…' : 'Your request was interrupted. Try it again below.'}</p>` : '';
  let body = '';
  if (s.phase === 'prepare') body = `<p>Preparing a short task…</p>${button('request', 'Load task', busy)}`;
  if (s.phase === 'guide' && s.scenario) {
    body = `<p>${e(s.scenario.situation)}</p><p><strong>Your goal:</strong> ${e(s.scenario.task)}</p>
      <h3>One useful line</h3><p>${e(s.scenario.expressions[0])}</p>
      ${s.scenario.tip ? `<details><summary>Usage note</summary><p>${e(s.scenario.tip)}</p></details>` : ''}
      ${button('continue', 'Your turn')}`;
  }
  if (s.phase === 'answer' && task) {
    body = `${s.round === 1 ? `<p class="structured-tip">What changed? ${e(s.rounds[0]!.feedback!.retry.change)}</p>` : ''}
      <p>${e(task.situation)}</p><p><strong>Your goal:</strong> ${e(task.task)}</p>
      <label for="structuredAnswer">Reply in Dutch</label>
      <textarea id="structuredAnswer" rows="3" maxlength="2000" placeholder="Type your reply…" ${busy ? 'disabled' : ''}>${e(round.draft)}</textarea>
      <div class="structured-hints">${task.hints.slice(0, round.hintsUsed).map((hint, i) => `<p><strong>Hint ${i + 1}:</strong> ${e(hint)}</p>`).join('')}</div>
      <div class="structured-actions">${button('hint', round.hintsUsed >= 3 ? 'All hints shown' : 'Give me a hint', busy || round.hintsUsed >= 3)}
      ${button('request', s.pending === 'feedback' ? 'Retry feedback' : 'Get feedback', busy)}</div>`;
  }
  if (s.phase === 'feedback' && round.feedback) {
    body = `<h3>Your reply</h3><blockquote>${e(round.submitted!)}</blockquote>${feedbackView(round.feedback)}
      <p class="structured-result">${outcomeLabels[practiceOutcome(s)]}</p>
      <div class="structured-actions">${s.round === 0 ? `${button('retry', 'Try a variation')}${button('skip', 'Finish here')}` : button('finish', 'Finish')}</div>`;
  }
  if (s.phase === 'complete') {
    body = `<h3>Practice complete</h3>
      ${s.rounds.map((r, i) => `<p><strong>${i === 0 ? 'First try' : 'Second try'}: ${outcomeLabels[practiceOutcome(s, i)]}</strong></p><blockquote>${e(r.submitted || '')}</blockquote>`).join('')}
      ${button('done', 'Back to your words')}`;
  }
  return `${heading}${state}${notice}${body}${error && ['feedback', 'complete'].includes(s.phase) ? button('save', 'Retry saving') : ''}`;
}
