import type { WordExplanation } from './word-explanation.ts';
import { escapeText } from './word-usage-ui.ts';
import { getWordAttempts } from './learning-store.ts';
import { usageHistory } from './word-learning.ts';

export type UsageLoadState = 'loading' | 'network' | 'http' | 'format';
function highlight(sentence: string, chunk?: string): string {
  const index = chunk ? sentence.toLocaleLowerCase('nl-NL').indexOf(chunk.toLocaleLowerCase('nl-NL')) : -1;
  return index < 0 ? escapeText(sentence) : `${escapeText(sentence.slice(0, index))}<strong>${escapeText(sentence.slice(index, index + chunk!.length))}</strong>${escapeText(sentence.slice(index + chunk!.length))}`;
}
export function renderWordExamples(data: WordExplanation, state?: UsageLoadState): string {
  const attempts = getWordAttempts(data.word);
  const examples = data.examples.slice(0, 1).map((example, index) => {
    const use = data.usage?.[index];
    const nl = use?.example_nl || example.nl;
    const en = use?.example_en || example.en;
    const last = use && usageHistory(data.word, use.chunk, attempts).filter(a => a.outcome !== 'self-reviewed').at(-1);
    const status = last?.outcome === 'independent' ? 'Zelf gebruikt' : last?.outcome === 'supported' ? 'Met hulp gebruikt' : last?.outcome === 'needs-practice' ? 'Nog eens proberen' : '';
    return `<div class="word-example${use ? ' word-use' : ''}">
      <div class="example-nl">“${highlight(nl, use?.chunk)}” <button class="ex-tts-btn" data-action="play-example-tts" data-text="${escapeText(nl)}" title="Uitspraak beluisteren">🔊</button></div>
      <div class="example-en">${escapeText(en)}</div>
      ${use ? `<div class="example-pattern"><span class="pattern-label">Samen gebruiken</span> <strong>${escapeText(use.chunk)}</strong>
        <div class="use-frame">${escapeText(use.frame)}</div>
        ${status ? `<div class="use-status">${status}</div>` : ''}
        <button type="button" class="use-button" data-action="practice-usage" data-word="${escapeText(data.word)}" data-usage="${index}">Probeer zelf</button></div>` : ''}
    </div>`;
  }).join('');
  let notice = '';
  if (data.usage === undefined) {
    const message = state === 'loading' ? 'Voorbeelden en zinsbouw aanvullen…'
      : state === 'network' ? 'De verbinding is onderbroken. Je voorbeelden blijven beschikbaar.'
      : state === 'http' ? 'De taaldienst is tijdelijk niet beschikbaar. Je voorbeelden blijven beschikbaar.'
      : state === 'format' ? 'De extra taalhulp kon niet worden verwerkt. Je voorbeelden blijven beschikbaar.'
      : 'Bij dit voorbeeld ontbreekt nog aanvullende taalhulp.';
    notice = `<div class="usage-notice" role="status">${message}${state === 'loading' ? ''
      : `<button type="button" class="use-button secondary" data-action="retry-word-usage" data-word="${escapeText(data.word)}">Opnieuw proberen</button>`}</div>`;
  }
  return `<div class="card word-examples"><div class="card-label">Voorbeelden & gebruik</div>${examples}${notice}</div>`;
}
export function renderWordTips(data: WordExplanation): string {
  const warning = data.tips.trim();
  const memory = data.fun_fact?.trim();
  if (!warning && !memory) return '';
  return `<div class="card word-tips"><div class="card-label">Tips</div>
    ${memory ? `<div class="word-tip"><div class="tip-label">💡 Onthouden</div><div>${escapeText(memory)}</div></div>` : ''}
    ${warning ? `<div class="word-tip"><div class="tip-label">Let op</div><div>${escapeText(warning)}</div></div>` : ''}</div>`;
}
