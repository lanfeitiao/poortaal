import type { WordExplanation } from './word-explanation.ts';
import { getWordAttempts } from './learning-store.ts';
import { usageHistory } from './word-learning.ts';
import type { PracticeContext } from './practice-context.ts';

export function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export function renderWordUsage(data: WordExplanation): string {
  if (!data.usage?.length) return '';
  const attempts = getWordAttempts(data.word);
  const uses = data.usage.map((use, index) => {
    const last = usageHistory(data.word, use.chunk, attempts).filter(a => a.outcome !== 'self-reviewed').at(-1);
    const status = last?.outcome === 'independent' ? 'Zelf gebruikt' : last?.outcome === 'supported' ? 'Met hulp gebruikt' : last?.outcome === 'needs-practice' ? 'Nog eens proberen' : '';
    return `<div class="word-use"><strong>${escapeText(use.chunk)}</strong>
      <div class="example-en">${escapeText(use.meaning_en)}</div>
      <div class="use-frame">${escapeText(use.frame)}</div>
      <div class="example-nl">${escapeText(use.example_nl)}</div>
      <div class="example-en">${escapeText(use.example_en)}</div>
      ${status ? `<div class="use-status">${status}</div>` : ''}
      <button type="button" class="use-button" data-action="practice-usage" data-word="${escapeText(data.word)}" data-usage="${index}">Oefen deze toepassing</button></div>`;
  }).join('');
  return `<div class="card"><div class="card-label">Zo gebruik je ${escapeText(data.word)}</div>${uses}</div>`;
}
export function renderPracticeUsage(context: PracticeContext | null): string {
  const use = context?.usage;
  if (!use) return '';
  return `<details class="practice-use"><summary>Hulp bij ${escapeText(context!.word)}</summary>
    <div class="word-use"><strong>${escapeText(use.chunk)}</strong>
    <div>${escapeText(use.meaning_en)}</div><div class="use-frame">${escapeText(use.frame)}</div>
    <div>${escapeText(use.example_nl)}</div></div></details>`;
}
