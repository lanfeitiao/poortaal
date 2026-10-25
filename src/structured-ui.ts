import { StructuredPractice } from './structured-controller.ts';
import { renderStructured } from './structured-view.ts';
import { sessionStorageKey } from './structured-store.ts';

const root = () => document.getElementById('structuredPractice');
export const structuredPractice = new StructuredPractice(() => {
  const panel = root();
  if (panel) panel.innerHTML = renderStructured(structuredPractice.session, structuredPractice.busy, structuredPractice.error);
});
window.addEventListener('storage', event => {
  if ((event as StorageEvent).key === sessionStorageKey()) structuredPractice.refresh();
});
export function connectStructuredPractice(done: () => void): void {
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
