import type { PracticeContext } from './practice-context.ts';

export function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export function renderPracticeUsage(context: PracticeContext | null): string {
  const use = context?.usage;
  if (!use) return '';
  return `<details class="practice-use"><summary>Hulp bij ${escapeText(context!.word)}</summary>
    <div class="word-use"><strong>${escapeText(use.chunk)}</strong>
    <div>${escapeText(use.meaning_en)}</div><div class="use-frame">${escapeText(use.frame)}</div>
    <div>${escapeText(use.example_nl)}</div></div></details>`;
}
