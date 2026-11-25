import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyReviewText, validateDailyFeedback, type DailyFeedback } from './daily-chat-feedback.ts';
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

test('Daily Chat discards a cue that gives away the Dutch sentence', () => {
  const [feedback] = validateDailyFeedback([{ ...card, english: `Say “${card.dutch}”` }], [
    { role: 'user', content: card.quote },
  ]);
  assert.deepEqual(feedback, card);
});

test('Daily Chat shows a translation used as the review cue only once', () => {
  const english = 'Can my daughter come along too?';
  assert.deepEqual(dailyReviewText({ ...card, english, explanation: 'Can my daughter come along too' }), {
    prompt: 'Say the sentence in Dutch.', cue: english, note: '',
  });
  assert.equal(dailyReviewText({ ...card, english }).note, card.explanation);
});

test('older Daily Chat corrections use the original wording as their sentence cue', () => {
  for (const [quote, dutch, explanation] of [
    ['Het is tijd voor haar om de bed te gaan.', 'Het is tijd voor haar om naar bed te gaan.', 'Use naar bed gaan.'],
    ['Ze is het niet mee eens.', 'Ze is het er niet mee eens.', 'Use er … mee eens zijn.'],
  ]) {
    assert.deepEqual(dailyReviewText({ ...card, quote, dutch, explanation }), {
      prompt: 'Say the sentence in Dutch.', cue: quote, original: true, note: explanation,
    });
  }
  assert.equal(dailyReviewText({ ...card, kind: 'naturalness' }).cue, card.quote);
});

test('older Daily Chat cards without a usable recall cue practise the full sentence aloud', () => {
  const dutch = 'Ik voel me niet goed en wil niet opstaan.';
  const useful: DailyFeedback = { ...card, kind: 'useful', quote: dutch, dutch, explanation: 'I don’t feel well and don’t want to get up.' };
  for (const saved of [
    useful, { ...card, speaker: 'partner' } as const, { ...card, quote: `Je kunt zeggen: ${card.dutch}` },
  ]) {
    assert.deepEqual(dailyReviewText(saved), {
      prompt: 'Say the sentence in Dutch.', note: saved.explanation, practiceAloud: true,
    });
  }
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

test('Daily Chat saves distinct sentences per learner and preserves an existing review schedule', () => {
  const contents = new Map<string, string>();
  const storage = {
    getItem: (name: string) => contents.get(name) ?? null,
    setItem: (name: string, value: string) => { contents.set(name, value); },
  };
  const day = 86_400_000;
  const oldCard = { id: 'legacy-chat-id', card, dueAt: 0, level: 0 };
  storage.setItem('poortaal_daily_chat_review:first', JSON.stringify([oldCard]));
  saveExpression('first', { ...card, dutch: 'Mag zij ook mee?' }, storage, 0);
  assert.deepEqual(readExpressions('first', storage)[0], oldCard);
  assert.equal(readExpressions('first', storage).length, 2);
  assert.deepEqual(readExpressions('second', storage), []);
  saveExpression('second', { ...card, speaker: 'partner' }, storage, 0);
  assert.equal(readExpressions('second', storage)[0].card.speaker, 'partner');
  gradeExpression('first', oldCard.id, true, storage, 0);
  gradeExpression('first', oldCard.id, true, storage, 0);
  saveExpression('first', { ...card, dutch: card.dutch.toUpperCase().replace('?', '!') }, storage, 1);
  assert.equal(readExpressions('first', storage).length, 2);
  assert.equal(readExpressions('first', storage)[0].dueAt, day);
  gradeExpression('first', oldCard.id, true, storage, day);
  assert.equal(readExpressions('first', storage)[0].dueAt, 4 * day);
  gradeExpression('first', oldCard.id, false, storage, 4 * day);
  assert.equal(readExpressions('first', storage)[0].level, 0);
  assert.equal(readExpressions('first', storage)[0].dueAt, 5 * day);
});
