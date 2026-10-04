import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranscriptFragment } from './transcript-timing.ts';
import { groupTranscriptFragments, type TranscriptFragment } from './transcript-grouping.ts';

test('raw audio timestamps survive delayed delivery unchanged', () => {
  const part = createTranscriptFragment([], 'user', ' fruit', 0, 9000, 2050, 2250);
  assert.equal(part.startMs, 2050);
  assert.equal(part.endMs, 2250);
  assert.equal(part.receivedAtMs, 9000);
  assert.equal(part.timingSource, 'audio');
});

test('missing timing reconciles a delayed tail but retains elapsed time for a new turn', () => {
  const fragments: TranscriptFragment[] = [];
  fragments.push(createTranscriptFragment(fragments, 'user', 'Misschien ', 0, 3000, 1000, 2100));
  fragments.push(createTranscriptFragment(fragments, 'tutor', 'Ja.', 1, 3200, 2150, 2350));
  for (const [arrival, count] of [[3300, 2], [8000, 3]]) {
    const tail = createTranscriptFragment(fragments, 'user', 'fruit', 2, arrival, undefined, undefined);
    assert.equal(tail.timingSource, 'estimated');
    const groups = groupTranscriptFragments([...fragments, tail]);
    assert.equal(groups.length, count);
    if (count === 2) assert.equal(groups[0].text, 'Misschien fruit');
  }
});

test('partial timestamps stay on the audio timeline and invalid intervals are estimated', () => {
  for (const [start, end] of [[500, undefined], [undefined, 500]]) {
    const part = createTranscriptFragment([], 'user', 'Hi', 0, 900, start, end);
    assert.equal(part.startMs, 500);
    assert.equal(part.endMs, 500);
    assert.equal(part.timingSource, 'partial');
  }
  for (const [start, end] of [[NaN, Infinity], [-1, -2], [600, 500]]) {
    const part = createTranscriptFragment([], 'user', 'Hi', 0, 900, start, end);
    assert.equal(part.startMs, 0);
    assert.equal(part.endMs, 0);
    assert.equal(part.timingSource, 'estimated');
  }
});

test('a late audio fragment anchors its following untimed continuation', () => {
  const fragments: TranscriptFragment[] = [];
  fragments.push(createTranscriptFragment(fragments, 'tutor', 'Wat wil je eten?', 0, 1000, 3000, 5000));
  fragments.push(createTranscriptFragment(fragments, 'user', 'Misschien ', 1, 9000, 1000, 2000));
  const tail = createTranscriptFragment(fragments, 'user', 'fruit', 2, 9100, undefined, undefined);
  assert.equal(tail.startMs, 2100);
  assert.equal(tail.endMs, 2100);
  assert.deepEqual(groupTranscriptFragments([...fragments, tail]).map(group => group.text), [
    'Misschien fruit', 'Wat wil je eten?',
  ]);
});

test('an untimed speaker change after late delivery resumes at the timeline end', () => {
  const fragments: TranscriptFragment[] = [];
  fragments.push(createTranscriptFragment(fragments, 'tutor', 'Wat wil je eten?', 0, 1000, 3000, 5000));
  fragments.push(createTranscriptFragment(fragments, 'user', 'Misschien fruit', 1, 9000, 1000, 2000));
  const reply = createTranscriptFragment(fragments, 'tutor', ' Dat is gezond.', 2, 9100, undefined, undefined);
  assert.equal(reply.startMs, 5100);
  assert.equal(reply.endMs, 5100);
  assert.deepEqual(groupTranscriptFragments([...fragments, reply]).map(group => group.text), [
    'Misschien fruit', 'Wat wil je eten? Dat is gezond.',
  ]);
});
