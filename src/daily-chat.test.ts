import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDailyFeedback, type DailyFeedback } from './daily-chat-feedback.ts';
import { gradeExpression, readExpressions, saveExpression } from './daily-chat-store.ts';

const card: DailyFeedback = {
  kind: 'correction', quote: 'Mijn dochter ook mee komen?', dutch: 'Mag mijn dochter ook meekomen?',
  explanation: 'Use mag to ask permission.', situation: 'Ask a parent if your son can join the picnic.',
};

test('Daily Chat keeps grounded quotes and caps distinct feedback at eight', () => {
  const variants = Array.from({ length: 9 }, (_, i) => ({
    ...card, quote: `Ik heb ${i} appels.`, dutch: `Ik heb ${i} appels.`, kind: 'useful',
  }));
  const cards = validateDailyFeedback([
    { ...card, quote: 'Can you join?' }, card, { ...card, dutch: card.dutch.toUpperCase() },
    ...variants, null,
  ], [
    { role: 'assistant', content: 'Can you join?' },
    { role: 'user', content: [card.quote, ...variants.map(item => item.quote)].join(' ') },
  ]);
  assert.deepEqual(cards.map(item => item.quote), [card.quote, ...variants.slice(0, 7).map(item => item.quote)]);
});

test('Daily Chat grounds partner recasts and tolerates punctuation without inventing quotes', () => {
  const partner = { ...card, speaker: 'partner', quote: 'mag mijn dochter ook meekomen!' };
  const turns = [
    { role: 'user' as const, content: card.quote },
    { role: 'assistant' as const, content: `Je kunt zeggen: ${card.dutch}` },
  ];
  assert.deepEqual(validateDailyFeedback([partner], turns), [partner]);
  assert.deepEqual(validateDailyFeedback([{ ...partner, speaker: 'learner' }], turns), []);
  assert.deepEqual(validateDailyFeedback([{ ...partner, quote: 'Verzonnen zin' }], turns), []);
  assert.deepEqual(validateDailyFeedback([{ ...partner, quote: '?!' }], turns), []);
  assert.deepEqual(validateDailyFeedback([{ ...partner, speaker: 'unknown' }], turns), []);
  const accented = { ...card, quote: 'Zij heeft e\u0301e\u0301n appel.' };
  assert.deepEqual(validateDailyFeedback([accented], [
    { role: 'user', content: 'Zij heeft één appel.' },
  ]), [accented]);
});

test('Daily Chat can shorten one grounded turn into multiple distinct cards', () => {
  const shorter = { ...card, dutch: 'Mag zij ook mee?' };
  assert.equal(validateDailyFeedback([card, shorter], [{ role: 'user', content: card.quote }]).length, 2);
  assert.deepEqual(validateDailyFeedback([card], [
    { role: 'user', content: 'Mijn dochter' }, { role: 'user', content: 'ook mee komen?' },
  ]), []);
});

test('unchanged learner wording cannot be presented as an improvement', () => {
  const quote = 'Ik vind dat fijn.';
  const unchanged = { ...card, quote, dutch: quote };
  const turns = [{ role: 'user' as const, content: quote }];
  assert.deepEqual(validateDailyFeedback([{ ...unchanged, kind: 'naturalness' }], turns), []);
  assert.deepEqual(validateDailyFeedback([{ ...unchanged, dutch: 'ik vind dat fijn!' }], turns), []);
  assert.equal(validateDailyFeedback([{ ...unchanged, kind: 'useful' }], turns).length, 1);
  assert.equal(validateDailyFeedback([{ ...unchanged, kind: 'naturalness', speaker: 'partner' }], [
    { role: 'assistant', content: quote },
  ]).length, 1);
  assert.equal(validateDailyFeedback([{ ...card, quote: 'Mag mijn dochter ook mee komen?' }], [
    { role: 'user', content: 'Mag mijn dochter ook mee komen?' },
  ]).length, 1, 'a real spelling improvement is not an unchanged sentence');
});

test('word-internal apostrophes and hyphens remain genuine spelling corrections', () => {
  for (const [quote, dutch] of [
    ['Ik heb twee autos.', "Ik heb twee auto's."],
    ['Wij gaan meeeten.', 'Wij gaan mee-eten.'],
  ]) {
    assert.equal(validateDailyFeedback([{ ...card, quote, dutch }], [
      { role: 'user', content: quote },
    ]).length, 1);
  }
  const quote = 'Ik heb twee auto’s.';
  assert.deepEqual(validateDailyFeedback([{ ...card, quote, dutch: "Ik heb twee auto's." }], [
    { role: 'user', content: quote },
  ]), [], 'a typographic apostrophe change is not a language improvement');
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
  saveExpression('second', 'chat-2', { ...card, speaker: 'partner' }, storage, 0);
  assert.equal(readExpressions('second', storage)[0].card.speaker, 'partner');
  gradeExpression('first', 'chat-1', true, storage, 0);
  gradeExpression('first', 'chat-1', true, storage, 0);
  assert.equal(readExpressions('first', storage)[0].dueAt, day);
  gradeExpression('first', 'chat-1', true, storage, day);
  assert.equal(readExpressions('first', storage)[0].dueAt, 4 * day);
  gradeExpression('first', 'chat-1', false, storage, 4 * day);
  assert.equal(readExpressions('first', storage)[0].level, 0);
  assert.equal(readExpressions('first', storage)[0].dueAt, 5 * day);
});
