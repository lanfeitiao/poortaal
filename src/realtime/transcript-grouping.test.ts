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

test('a delayed unfinished learner tail stays before a short acknowledgment', () => {
  for (const tailStart of [2050, 2400]) {
    const fragments = [
      fragment('user', 1000, 2100, 'Ik vind um... Misschien ', 0),
      fragment('tutor', 2150, 2350, 'Ja.', 1),
      fragment('user', tailStart, tailStart + 200, 'fruit', 2),
    ];
    for (const delivery of [fragments, [fragments[0], fragments[2], fragments[1]]]) {
      const groups = groupTranscriptFragments(delivery);
      assert.deepEqual(groups.map(group => [group.role, group.text]), [
        ['user', 'Ik vind um... Misschien fruit'], ['tutor', 'Ja.'],
      ]);
      assert.deepEqual(groups[0].sequences.sort(), [0, 2]);
    }
  }
});

test('a short acknowledgment does not absorb a completed sentence or a distant new turn', () => {
  for (const [text, start] of [['Ik kies fruit.', 2400], ['Ik kies ', 5000]] as const) {
    const groups = groupTranscriptFragments([
      fragment('user', 1000, 2100, text, 0),
      fragment('tutor', 2150, 2350, 'Ja.', 1),
      fragment('user', start, start + 200, 'En jij?', 2),
    ]);
    assert.equal(groups.length, 3);
  }
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

for (const role of ['user', 'tutor'] as const) {
  test(`${role} pauses without a speaker change stay in one bubble`, () => {
    const fragments = [
      fragment(role, 1000, 1500, 'Ik ben ', 0),
      fragment(role, 4000, 4300, 'verbaasd, ', 1),
      fragment(role, 12000, 13000, 'dank je wel.', 2),
    ];
    for (let count = 1; count <= fragments.length; count += 1) {
      const groups = groupTranscriptFragments(fragments.slice(0, count));
      assert.equal(groups.length, 1);
      assert.equal(groups[0].text, fragments.slice(0, count).map(part => part.text).join(''));
    }
  });
}

test('a genuine reply after a long pause still starts a new bubble', () => {
  const groups = groupTranscriptFragments([
    fragment('user', 0, 1000, 'Dank je.', 0),
    fragment('tutor', 3000, 4500, 'Graag gedaan!', 1),
    fragment('user', 12000, 13000, 'Tot ziens.', 2),
  ]);
  assert.deepEqual(groups.map(group => group.text), ['Dank je.', 'Graag gedaan!', 'Tot ziens.']);
});

test('interleaved overlapping captions do not chop both speakers into word bubbles', () => {
  const fragments = [
    fragment('user', 0, 1000, 'Ah, ik ben verbaasd, dank je wel voor het ', 0),
    fragment('tutor', 950, 1150, 'Graag ', 1),
    fragment('user', 1100, 1400, 'cadeautje', 2),
    fragment('tutor', 1300, 2400, 'gedaan! Ik dacht dat je dit leuk zou vinden.', 3),
  ];
  for (const delivery of [fragments, [fragments[0], fragments[2], fragments[1], fragments[3]]]) {
    const groups = groupTranscriptFragments(delivery);
    assert.deepEqual(groups.map(group => [group.role, group.text]), [
      ['user', 'Ah, ik ben verbaasd, dank je wel voor het cadeautje'],
      ['tutor', 'Graag gedaan! Ik dacht dat je dit leuk zou vinden.'],
    ]);
  }
});

test('a completed overlapping reply still separates the next real turn', () => {
  const groups = groupTranscriptFragments([
    fragment('user', 0, 1000, 'Dank je ', 0),
    fragment('tutor', 950, 1150, 'Graag ', 1),
    fragment('user', 1100, 1400, 'wel.', 2),
    fragment('tutor', 1300, 2400, 'gedaan!', 3),
    fragment('user', 3000, 3500, 'Tot ziens.', 4),
  ]);
  assert.deepEqual(groups.map(group => group.text), ['Dank je wel.', 'Graag gedaan!', 'Tot ziens.']);
});

test('starting to answer during a later reply does not join an earlier turn', () => {
  const groups = groupTranscriptFragments([
    fragment('user', 0, 500, 'Hallo.', 0),
    fragment('tutor', 1000, 2000, 'Hallo! ', 1),
    fragment('tutor', 2100, 4500, 'Hoe gaat het?', 2),
    fragment('user', 4000, 5000, 'Goed.', 3),
  ]);
  assert.deepEqual(groups.map(group => group.text), ['Hallo.', 'Hallo! Hoe gaat het?', 'Goed.']);
});

for (const role of ['user', 'tutor'] as const) {
  test(`${role} returning during a reply with an overlapping start is a new turn`, () => {
    const other = role === 'user' ? 'tutor' : 'user';
    const groups = groupTranscriptFragments([
      fragment(role, 0, 1000, 'First turn.', 0),
      fragment(other, 950, 2400, 'Intervening reply.', 1),
      fragment(role, 2000, 2500, 'New turn.', 2),
    ]);
    assert.deepEqual(groups.map(group => group.text), ['First turn.', 'Intervening reply.', 'New turn.']);
  });
}
