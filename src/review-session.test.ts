import assert from 'node:assert/strict';
import test from 'node:test';
import { clearReviewCheckpoint, readReviewCheckpoint, writeReviewCheckpoint, type ReviewCardRef } from './review-session.ts';

function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  return { values, storage };
}

test('review checkpoint survives reload at card four of seven and is scoped to its owner', () => {
  const { storage } = fixture();
  const cards: ReviewCardRef[] = [
    { kind: 'word', id: 'een' }, { kind: 'word', id: 'twee' }, { kind: 'word', id: 'drie' },
    { kind: 'expression', id: 'een' }, { kind: 'word', id: 'vijf' },
    { kind: 'expression', id: 'sentence-two' }, { kind: 'word', id: 'zeven' },
  ];
  writeReviewCheckpoint('learner', { cards, index: 3, know: 2, again: 1, revealed: false }, storage);
  assert.deepEqual(readReviewCheckpoint('learner', storage), { cards, index: 3, know: 2, again: 1, revealed: false });
  assert.equal(readReviewCheckpoint('another-learner', storage), null);
  writeReviewCheckpoint('learner', { cards, index: 4, know: 3, again: 1, revealed: true }, storage);
  assert.equal(readReviewCheckpoint('learner', storage)?.index, 4);
  assert.equal(readReviewCheckpoint('learner', storage)?.revealed, true);
  writeReviewCheckpoint('learner', { cards, index: 4, know: 3, again: 1, revealed: false, wordMeaningRevealed: true }, storage);
  assert.equal(readReviewCheckpoint('learner', storage)?.wordMeaningRevealed, true);
  assert.equal(readReviewCheckpoint('learner', storage)?.revealed, false);
  clearReviewCheckpoint('learner', storage);
  assert.equal(readReviewCheckpoint('learner', storage), null);
});

test('a saved word-only review keeps its order and progress after upgrading', () => {
  const { storage } = fixture();
  const progress = { index: 1, know: 1, again: 0, revealed: true };
  storage.setItem('poortaal_review_session:learner', JSON.stringify({ words: ['een', 'twee'], ...progress }));
  assert.deepEqual(readReviewCheckpoint('learner', storage), {
    cards: [{ kind: 'word', id: 'een' }, { kind: 'word', id: 'twee' }], ...progress,
  });
});

test('invalid or corrupted checkpoints are ignored rather than resetting a live review', () => {
  const { storage, values } = fixture();
  for (const payload of ['not-json', JSON.stringify({ words: ['x'], index: 2, know: 0, again: 0, revealed: false }),
    JSON.stringify({ words: ['x', 'x'], index: 1, know: 1, again: 0, revealed: false }),
    JSON.stringify({ words: ['x'], index: 0, know: 1, again: 0, revealed: false }),
    JSON.stringify({ cards: [{ kind: 'unknown', id: 'x' }], index: 0, know: 0, again: 0, revealed: false })]) {
    values.set('poortaal_review_session:learner', payload);
    assert.equal(readReviewCheckpoint('learner', storage), null);
  }
});

test('storage being unavailable never crashes review progression', () => {
  const storage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.equal(readReviewCheckpoint('learner', storage), null);
  assert.doesNotThrow(() => writeReviewCheckpoint('learner', {
    cards: [{ kind: 'word', id: 'x' }], index: 0, know: 0, again: 0, revealed: false,
  }, storage));
  assert.doesNotThrow(() => clearReviewCheckpoint('learner', storage));
});
