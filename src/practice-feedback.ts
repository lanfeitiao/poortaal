import { analysePractice } from './feedback-analysis.ts';
import { feedbackAttempt, type Feedback, type PracticeSnapshot } from './feedback-contract.ts';
import { feedbackHtml } from './feedback-view.ts';
import { discardWordAttempt, getWordAttempts, learningOwner, recordWordAttempt } from './learning-store.ts';
import { getPracticeContext } from './practice-context.ts';

let revision = 0;
function root(): HTMLElement | null { return document.getElementById('practiceFeedback'); }
export function resetPracticeFeedback(): void {
  revision++;
  const panel = root();
  if (panel) { panel.hidden = true; panel.innerHTML = ''; }
}
window.addEventListener('poortaal:learning-owner', resetPracticeFeedback);

export async function finishPracticeFeedback(snapshot: PracticeSnapshot): Promise<void> {
  const panel = root();
  if (!panel || snapshot.owner !== learningOwner()) return;
  const ticket = ++revision;
  const contextId = getPracticeContext()?.id;
  const current = () => revision === ticket && snapshot.owner === learningOwner() && contextId === getPracticeContext()?.id;
  panel.hidden = false;
  if (!snapshot.turns.some(t => t.role === 'user' && t.content.trim())) {
    panel.textContent = 'Er is nog geen antwoord om op terug te kijken.';
    return;
  }
  panel.textContent = 'Even terugkijken naar je gesprek…';
  try {
    const feedback = await analysePractice({ ...snapshot, recent: getWordAttempts(snapshot.word) });
    if (!current()) return;
    panel.innerHTML = feedbackHtml(snapshot, feedback);
    const attempt = feedbackAttempt(snapshot, feedback);
    if (attempt) {
      try { recordWordAttempt(attempt); }
      catch { panel.append(' Je voortgang kon niet worden opgeslagen.'); }
    }
    connectActions(panel, snapshot, feedback);
  } catch {
    if (!current()) return;
    panel.textContent = 'Feedback is nu niet beschikbaar. Je kunt de analyse opnieuw proberen.';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'use-button'; button.textContent = 'Opnieuw terugkijken';
    button.addEventListener('click', () => { void finishPracticeFeedback(snapshot); });
    panel.append(button);
  }
}

function connectActions(panel: HTMLElement, snapshot: PracticeSnapshot, feedback: Feedback): void {
  const button = (action: string) => panel.querySelector<HTMLButtonElement>(`[data-feedback="${action}"]`);
  const retry = panel.querySelector<HTMLElement>('.feedback-retry');
  const input = panel.querySelector<HTMLTextAreaElement>('.feedback-input');
  button('retry')?.addEventListener('click', () => { if (retry) retry.hidden = false; input?.focus(); });
  button('example')?.addEventListener('click', () => {
    const example = panel.querySelector<HTMLElement>('.feedback-example');
    if (example) example.hidden = false;
  });
  button('discard')?.addEventListener('click', () => {
    if (snapshot.owner !== learningOwner()) return;
    discardWordAttempt(snapshot.word, snapshot.id);
    revision++;
    panel.textContent = 'Deze feedback telt niet mee voor je volgende oefening.';
  });
  button('send')?.addEventListener('click', () => {
    const answer = input?.value.trim();
    if (!answer) { input?.focus(); return; }
    void finishPracticeFeedback({ ...snapshot, id: crypto.randomUUID(), supportUsed: true, settled: true,
      turns: [{ role: 'assistant', content: feedback.retry_prompt }, { role: 'user', content: answer }] });
  });
}
