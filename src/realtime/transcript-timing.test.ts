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

test('an untimed compound-word suffix can reconcile across an echoed reply', () => {
  for (const arrival of [3300, 8000]) {
    const fragments: TranscriptFragment[] = [];
    fragments.push(createTranscriptFragment(fragments, 'user', 'Wat betekent rond', 0, 3000, 1000, 2100));
    fragments.push(createTranscriptFragment(fragments, 'tutor', 'Rondlopen', 1, 3200, 2150, 2350));
    const tail = createTranscriptFragment(fragments, 'user', 'lopen?', 2, arrival, undefined, undefined);
    assert.equal(tail.timingSource, 'estimated');
    fragments.push(tail);
    const groups = groupTranscriptFragments(fragments);
    assert.deepEqual(groups.map(group => group.text), arrival === 3300
      ? ['Wat betekent rondlopen?', 'Rondlopen']
      : ['Wat betekent rond', 'Rondlopen', 'lopen?']);
    assert.equal(fragments[0].endMs, 2100);
    assert.equal(fragments[1].startMs, 2150);
  }
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
  assert.equal(tail.startMs, 2000);
  assert.equal(tail.endMs, 2000);
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

test('an untimed new same-speaker turn does not follow a stale fragment back in time', () => {
  for (const reply of ['Goed gedaan!', ' goed gedaan!']) {
    const fragments: TranscriptFragment[] = [];
    fragments.push(createTranscriptFragment(fragments, 'tutor', 'Wat wil je eten?', 0, 1000, 3000, 5000));
    fragments.push(createTranscriptFragment(fragments, 'user', 'Fruit.', 1, 3000, 6000, 7000));
    fragments.push(createTranscriptFragment(fragments, 'tutor', 'Hallo. ', 2, 9000, 1000, 2000));
    const next = createTranscriptFragment(fragments, 'tutor', reply, 3, 9100, undefined, undefined);
    assert.equal(next.startMs, 7100);
    assert.deepEqual(groupTranscriptFragments([...fragments, next]).map(group => group.text), [
      'Hallo. Wat wil je eten?', 'Fruit.', reply,
    ]);
  }
});

test('delivery delay cannot carry a continuation onto a later same-role turn', () => {
  for (const text of ['fruit', 'fruit.']) {
    const fragments: TranscriptFragment[] = [];
    fragments.push(createTranscriptFragment(fragments, 'tutor', 'Ja.', 0, 1000, 2100, 2300));
    fragments.push(createTranscriptFragment(fragments, 'user', 'Later.', 1, 3000, 3000, 3500));
    fragments.push(createTranscriptFragment(fragments, 'user', 'Misschien ', 2, 9000, 1000, 2000));
    const tail = createTranscriptFragment(fragments, 'user', text, 3, 10500, undefined, undefined);
    assert.equal(tail.startMs, 2000);
    assert.deepEqual(groupTranscriptFragments([...fragments, tail]).map(group => group.text), [
      `Misschien ${text}`, 'Ja.', 'Later.',
    ]);
  }
});

test('an acknowledgment delivery does not discard a delayed same-speaker prefix', () => {
  for (const partial of [false, true]) {
    const fragments: TranscriptFragment[] = [];
    fragments.push(createTranscriptFragment(fragments, 'user', 'Later.', 0, 1000, 3000, 3500));
    fragments.push(createTranscriptFragment(fragments, 'user', 'Misschien ', 1, 9000, 1000, 2000));
    fragments.push(createTranscriptFragment(fragments, 'tutor', partial ? 'J' : 'Ja.', 2, 9200, 2100, partial ? 2150 : 2300));
    const tail = createTranscriptFragment(fragments, 'user', 'fruit', 3, 9300, undefined, undefined);
    assert.equal(tail.startMs, 2000);
    fragments.push(tail);
    if (partial) fragments.push(createTranscriptFragment(fragments, 'tutor', 'a.', 4, 9400, 2150, 2300));
    assert.deepEqual(groupTranscriptFragments(fragments).map(group => group.text), [
      'Misschien fruit', 'Ja.', 'Later.',
    ]);
  }
});

test('a full intervening reply retires the old same-speaker prefix', () => {
  const fragments: TranscriptFragment[] = [];
  fragments.push(createTranscriptFragment(fragments, 'tutor', 'Ja.', 0, 500, 2100, 2300));
  fragments.push(createTranscriptFragment(fragments, 'user', 'Later.', 1, 1000, 3000, 3500));
  fragments.push(createTranscriptFragment(fragments, 'user', 'Misschien ', 2, 9000, 1000, 2000));
  fragments.push(createTranscriptFragment(fragments, 'tutor', 'Wat wil je eten?', 3, 9200, 3600, 4100));
  const next = createTranscriptFragment(fragments, 'user', 'fruit', 4, 9300, undefined, undefined);
  assert.equal(next.startMs, 4200);
  assert.deepEqual(groupTranscriptFragments([...fragments, next]).map(group => group.text), [
    'Misschien ', 'Ja.', 'Later.', 'Wat wil je eten?', 'fruit',
  ]);
});
