import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDailyFeedback, type DailyFeedback } from './daily-chat-feedback.ts';
import { gradeExpression, readExpressions, saveExpression } from './daily-chat-store.ts';

const card: DailyFeedback = {
  kind: 'correction', quote: 'Mijn dochter ook mee komen?', dutch: 'Mag mijn dochter ook meekomen?',
  explanation: 'Use mag to ask permission.', situation: 'Ask a parent if your son can join the picnic.',
};

test('Daily Chat keeps grounded learner quotes and caps distinct feedback at three', () => {
  const variants = ['het is mooi', 'Wij zijn klaar', 'Wij gaan nu'].map(quote => ({
    ...card, quote, dutch: quote, kind: 'useful',
  }));
  const cards = validateDailyFeedback([
    { ...card, quote: 'Can you join?' }, card, { ...card, dutch: 'Other wording.' },
    ...variants, null,
  ], [
    { role: 'assistant', content: 'Can you join?' },
    { role: 'user', content: [card.quote, ...variants.map(item => item.quote)].join(' ') },
  ]);
  assert.deepEqual(cards.map(item => item.quote), [card.quote, variants[0].quote, variants[1].quote]);
});

test('Daily Chat saves one expression per chat and schedules another review per learner', () => {
  const contents = new Map<string, string>();
  const storage = {
    getItem: (name: string) => contents.get(name) ?? null,
    setItem: (name: string, value: string) => { contents.set(name, value); },
  };
  const day = 86_400_000;
  saveExpression('first', 'chat-1', card, storage, 0);
  saveExpression('first', 'chat-1', { ...card, dutch: 'Different answer' }, storage, 0);
  assert.deepEqual(readExpressions('first', storage), [{ id: 'chat-1', card, dueAt: 0, level: 0 }]);
  assert.deepEqual(readExpressions('second', storage), []);
  gradeExpression('first', 'chat-1', true, storage, 0);
  gradeExpression('first', 'chat-1', true, storage, 0);
  assert.equal(readExpressions('first', storage)[0].dueAt, day);
  gradeExpression('first', 'chat-1', true, storage, day);
  assert.equal(readExpressions('first', storage)[0].dueAt, 4 * day);
  gradeExpression('first', 'chat-1', false, storage, 4 * day);
  assert.equal(readExpressions('first', storage)[0].level, 0);
  assert.equal(readExpressions('first', storage)[0].dueAt, 5 * day);
});
