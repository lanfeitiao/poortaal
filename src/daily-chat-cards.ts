import type { DailyFeedback } from './daily-chat-feedback.ts';
import { saveExpression } from './daily-chat-store.ts';
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

export function renderCards(panel: HTMLElement, cards: DailyFeedback[], owner: string, id: string): void {
  panel.replaceChildren();
  if (!cards.length) line(panel, 'No clear expressions to review from this chat.');
  const buttons: HTMLButtonElement[] = [];
  const result = line(panel, '');
  for (const card of cards) {
    const item = line(panel, '', 'article'); item.className = 'card';
    line(item, labels[card.kind], 'h3'); line(item, 'You said “' + card.quote + '”');
    line(item, card.dutch, 'strong'); line(item, card.explanation);
    buttons.push(action(item, 'Save to Review', () => {
      if (owner !== learningOwner()) return;
      try {
        saveExpression(owner, id, card);
        for (const button of buttons) button.disabled = true;
        result.textContent = 'Saved to Review.';
      } catch { result.textContent = 'Could not save. Try again.'; }
    }));
  }
}
