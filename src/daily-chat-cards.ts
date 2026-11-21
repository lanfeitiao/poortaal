import { expressionKey, type DailyFeedback } from './daily-chat-feedback.ts';
import { readExpressions, saveExpression } from './daily-chat-store.ts';
import { learningOwner } from './learning-store.ts';

const labels = { correction: 'Correction', naturalness: 'More natural', translation: 'How to say it in Dutch', useful: 'Worth reusing' };

export function line(parent: HTMLElement, text: string, tag = 'p'): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

export function action(parent: HTMLElement, label: string, click: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'use-button'; button.textContent = label;
  button.addEventListener('click', click); parent.append(button);
  return button;
}

export function renderCards(panel: HTMLElement, cards: DailyFeedback[], owner: string): void {
  panel.replaceChildren();
  if (!cards.length) {
    line(panel, 'No clear expressions to review from this chat.');
    return;
  }
  line(panel, 'Save any sentence to practise saying it in a new situation under Herhalen.').className = 'daily-chat-intro';
  const saved = new Set(readExpressions(owner).map(entry => expressionKey(entry.card.dutch)));
  for (const card of cards) {
    const item = line(panel, '', 'article'); item.className = 'card';
    line(item, labels[card.kind], 'h3');
    line(item, (card.speaker === 'partner' ? 'Poortaal said “' : 'You said “') + card.quote + '”');
    line(item, card.dutch, 'strong'); line(item, card.explanation);
    const showSaved = () => {
      button.disabled = true;
      button.textContent = 'Saved to Review';
      status.replaceChildren();
      const link = line(status, 'Open Review', 'a') as HTMLAnchorElement;
      link.href = '#review';
      link.className = 'daily-chat-link';
    };
    const button = action(item, 'Save to Review', () => {
      if (owner !== learningOwner()) return;
      try {
        saveExpression(owner, card);
        showSaved();
        window.dispatchEvent(new Event('poortaal:expression-saved'));
      } catch { status.textContent = 'Could not save this sentence. Try again.'; }
    });
    const status = line(item, '', 'div');
    status.setAttribute('role', 'status');
    if (saved.has(expressionKey(card.dutch))) showSaved();
  }
}
