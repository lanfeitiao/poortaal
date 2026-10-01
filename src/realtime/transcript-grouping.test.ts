import assert from 'node:assert/strict';
import test from 'node:test';
import { groupTranscriptFragments, type TranscriptFragment } from './transcript-grouping.ts';

function fragment(
  role: 'tutor' | 'user',
  startMs: number,
  endMs: number,
  text: string,
  sequence: number,
): TranscriptFragment {
  return { role, startMs, endMs, text, sequence };
}

test('late opposite speech re-splits same-speaker fragments', () => {
  const groups = groupTranscriptFragments([
    fragment('user', 0, 1000, 'A', 0),
    fragment('user', 1400, 1600, 'B', 1),
    fragment('tutor', 900, 1300, 'T', 2),
  ]);
  assert.deepEqual(groups.map(group => [group.role, group.text]), [
    ['user', 'A'],
    ['tutor', 'T'],
    ['user', 'B'],
  ]);
});

test('late earlier text is rebuilt in timeline order', () => {
  const groups = groupTranscriptFragments([
    fragment('tutor', 900, 1400, 'wereld', 0),
    fragment('tutor', 500, 950, 'Hallo ', 1),
  ]);
  assert.equal(groups[0].text, 'Hallo wereld');
});

test('overlapping same-speaker fragments stay together during full duplex speech', () => {
  const groups = groupTranscriptFragments([
    fragment('user', 0, 1000, 'A', 0),
    fragment('tutor', 900, 1100, 'T', 1),
    fragment('user', 950, 1400, 'B', 2),
  ]);
  assert.deepEqual(groups.map(group => [group.role, group.text]), [
    ['user', 'AB'],
    ['tutor', 'T'],
  ]);
});

test('a short pause without another speaker stays in one bubble', () => {
  const groups = groupTranscriptFragments([
    fragment('user', 1000, 1500, 'A', 0),
    fragment('user', 2600, 2900, 'B', 1),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].text, 'AB');
});

test('a long silence starts a new bubble', () => {
  const groups = groupTranscriptFragments([
    fragment('user', 1000, 1500, 'A', 0),
    fragment('user', 4000, 4300, 'B', 1),
  ]);
  assert.equal(groups.length, 2);
});
