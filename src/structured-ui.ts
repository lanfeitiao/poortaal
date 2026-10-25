import { StructuredPractice } from './structured-controller.ts';
import { renderStructured } from './structured-view.ts';
import { sessionStorageKey } from './structured-store.ts';
import { renderVoicePractice } from './structured-voice-view.ts';

const root = () => document.getElementById('structuredPractice');
export const structuredPractice = new StructuredPractice(() => {
  const panel = root();
  const s = structuredPractice.session;
  if (panel && s?.delivery !== 'voice') panel.innerHTML = renderStructured(s, structuredPractice.busy, structuredPractice.error);
  const voice = document.getElementById('voicePracticeSteps');
  if (voice) voice.innerHTML = s?.delivery === 'voice' ? renderVoicePractice(s, structuredPractice.busy, structuredPractice.error) : '';
  const start = document.getElementById('voiceStartBtn');
  if (start) start.hidden = s?.delivery === 'voice' && s.phase !== 'answer';
});
window.addEventListener('storage', event => {
  if ((event as StorageEvent).key === sessionStorageKey()) structuredPractice.refresh();
});
export function connectStructuredPractice(done: () => void): void {
  document.getElementById('voicePracticeSteps')?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-voice]');
    if (!button || button.disabled) return;
    if (button.dataset.voice === 'done') done();
    else window.dispatchEvent(new CustomEvent('poortaal:voice-action', { detail: button.dataset.voice }));
  });
  root()?.addEventListener('input', event => {
    const input = event.target as HTMLTextAreaElement;
    if (input.id !== 'structuredAnswer') return;
    structuredPractice.draft(input.value);
    const error = root()?.querySelector('.structured-error');
    if (error) error.textContent = structuredPractice.error;
  });
  root()?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-structured]');
    if (!button || button.disabled) return;
    const action = button.dataset.structured;
    if (action === 'request') void structuredPractice.request();
    else if (action === 'hint') structuredPractice.hint();
    else if (action === 'save') { structuredPractice.syncProgress(); root()!.innerHTML = renderStructured(structuredPractice.session, false, structuredPractice.error); }
    else if (action === 'done') done();
    else if (action === 'continue' || action === 'retry' || action === 'skip' || action === 'finish') structuredPractice.advance(action);
    if (action === 'continue' || action === 'retry') document.getElementById('structuredAnswer')?.focus();
  });
}
