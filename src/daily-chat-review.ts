import { action, line } from './daily-chat-cards.ts';
import { gradeExpression, readExpressions } from './daily-chat-store.ts';
import { learningOwner } from './learning-store.ts';

let revealed: { owner: string; id: string } | null = null;

export function appendExpressionReview(home: HTMLElement): void {
  const owner = learningOwner();
  const saved = readExpressions(owner);
  if (!saved.length) return;
  const section = line(home, '', 'section');
  section.className = 'card';
  const render = () => {
    section.replaceChildren();
    line(section, 'Daily Chat expressions', 'h2');
    const card = readExpressions(owner)
      .filter(entry => entry.dueAt <= Date.now()).sort((a, b) => a.dueAt - b.dueAt)[0];
    if (!card) {
      line(section, 'No expressions due right now.');
      return;
    }
    line(section, card.card.situation);
    line(section, 'Say your reply in Dutch.');
    if (revealed?.owner !== owner || revealed.id !== card.id) {
      action(section, 'Reveal a possible reply', () => {
        revealed = { owner, id: card.id };
        render();
      });
      return;
    }
    line(section, card.card.dutch, 'strong');
    line(section, card.card.explanation);
    const status = line(section, '');
    const grade = (known: boolean) => {
      if (learningOwner() !== owner) return;
      try {
        gradeExpression(owner, card.id, known);
        revealed = null;
        render();
      } catch {
        status.textContent = 'Could not save the review. Try again.';
      }
    };
    action(section, 'Again', () => grade(false));
    action(section, 'Got it', () => grade(true));
  };
  render();
}
