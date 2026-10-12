import assert from 'node:assert/strict';
import test from 'node:test';
import { groupTranscriptFragments, type TranscriptFragment } from './transcript-grouping.ts';
import { createTranscriptFragment } from './transcript-timing.ts';

const cases = [
  ['Bovendien, het is tijd voor ons te relaxen Hoe zeg je dat, relaxen het Engels, in het', ' Nederlands', 'Ja, precies. Je kunt zeggen: ontspannen.'],
  ['Ik... ehm ik ga met mijn family, mijn dochter, en mijn', ' man', 'Leuk,'],
  ['Goed. Ja, ik vind dat ook, dat wandelen in de natuur is ehm lekker, luchtig en bovendien ehm goed voor mijn... ik... ehm', ' gezondheid', 'Ja, precies. En na het wandelen kun je misschien ook iets kleins eten daar.'],
] as const;

function session(prefix: string, tail: string, reply: string, estimated = false): TranscriptFragment[] {
  return [
    { role: 'user', startMs: 1000, endMs: 2100, text: prefix, sequence: 0, receivedAtMs: 3000 },
    { role: 'tutor', startMs: 2150, endMs: 5000, text: reply, sequence: 1, receivedAtMs: 3200 },
    { role: 'user', startMs: estimated ? 5100 : 2400, endMs: estimated ? 5100 : 2600,
      text: tail, sequence: 2, receivedAtMs: 6000, timingSource: estimated ? 'estimated' : 'audio' },
  ];
}

test('screenshot noun tails stay in the learner bubble across full tutor replies', () => {
  for (const [prefix, tail, reply] of cases) for (const estimated of [false, true]) {
    const parts = session(prefix, tail, reply, estimated);
    for (const delivery of [parts, [parts[0], parts[2], parts[1]]]) {
      assert.deepEqual(groupTranscriptFragments(delivery).map(group => group.text), [prefix + tail, reply]);
    }
  }
});

test('noun-tail repair preserves independent answers, finished sentences and distant speech', () => {
  for (const [prefix, tail, reply] of [
    ['Ik ga met mijn man.', ' Nederlands', 'Leuk.'],
    ['Ik weet het niet', ' man', 'Leuk.'],
    ['Ik weet het', ' morgen', 'Dat klopt.'],
    ['Dat moet zo zijn', ' morgen', 'Dat klopt.'],
    ['Ik zie haar', ' morgen', 'Leuk.'],
    ['Ik geloof in het', ' maandag', 'Dat klopt.'],
    ['Ik hou van haar', ' maandag', 'Dat klopt.'],
    ['Dat is voor ons', ' maandag', 'Dat klopt.'],
    ['Ik ga met hun', ' maandag', 'Dat klopt.'],
    ['Ik ga met mijn', ' man', 'Met wie ga je?'],
    ['Ik ga met mijn', ' Ik weet het niet.', 'Leuk.'],
    ['Ik ga met mijn', ' ja', 'Leuk.'],
  ]) {
    assert.equal(groupTranscriptFragments(session(prefix, tail, reply)).length, 3);
  }
  const parts = session(...cases[1]);
  parts[2].startMs = 6000;
  parts[2].endMs = 6200;
  assert.equal(groupTranscriptFragments(parts).length, 3);
});

test('native untimed deltas repair split nouns while leaving source timestamps intact', () => {
  for (const [prefix, tail, reply] of cases) {
    const parts: TranscriptFragment[] = [];
    const add = (role: 'user' | 'tutor', text: string, receivedAt: number) => {
      parts.push(createTranscriptFragment(parts, role, text, parts.length, receivedAt, undefined, undefined));
    };
    add('user', prefix, 3000);
    add('tutor', reply.slice(0, 3), 3200);
    add('tutor', reply.slice(3), 5000);
    add('user', tail.slice(0, 4), 6000);
    add('user', tail.slice(4), 6100);
    const source = structuredClone(parts);
    assert.deepEqual(groupTranscriptFragments(parts).map(group => group.text), [prefix + tail, reply]);
    assert.deepEqual(parts, source);
  }
});

test('missing timing repair expires and does not cross an intervening learner turn', () => {
  const expired = session(...cases[1], true);
  expired[2].receivedAtMs = 11001;
  assert.equal(groupTranscriptFragments(expired).length, 3);
  const parts = session(...cases[1], true);
  parts.splice(2, 0,
    { role: 'user', startMs: 5050, endMs: 5060, text: 'Ja.', sequence: 3 },
    { role: 'tutor', startMs: 5070, endMs: 5080, text: 'Fijn.', sequence: 4 });
  assert.deepEqual(groupTranscriptFragments(parts).map(group => group.text), [cases[1][0], cases[1][2], 'Ja.', 'Fijn.', cases[1][1]]);
});

test('an estimated first piece does not override distant reliable word timing', () => {
  const parts = session(...cases[2], true);
  parts[2].text = ' ge';
  parts.push({ role: 'user', startMs: 6000, endMs: 6200, text: 'zondheid',
    sequence: 3, receivedAtMs: 6100, timingSource: 'audio' });
  assert.deepEqual(groupTranscriptFragments(parts).map(group => group.text), [cases[2][0], cases[2][2], cases[2][1]]);
});

test('a streamed untimed noun expires based on its final piece as well', () => {
  const parts = session(...cases[2], true);
  parts[2].text = ' ge';
  parts.push({ role: 'user', startMs: 5200, endMs: 5200, text: 'zondheid',
    sequence: 3, receivedAtMs: 11001, timingSource: 'estimated' });
  assert.equal(groupTranscriptFragments(parts).length, 3);
});

test('an estimated first word piece stays before an earlier audio-timed suffix', () => {
  const parts = session(...cases[2], true);
  parts[2].text = ' ge';
  parts.push({ role: 'user', startMs: 2400, endMs: 2600, text: 'zondheid',
    sequence: 3, receivedAtMs: 6100, timingSource: 'audio' });
  assert.deepEqual(groupTranscriptFragments(parts).map(group => group.text), [cases[2][0] + cases[2][1], cases[2][2]]);
});

test('mixed-timing lexical repair cannot cross an intervening speaker packet', () => {
  const parts: TranscriptFragment[] = [
    { role: 'user', text: 'Hallo', sequence: 0, startMs: 1000, endMs: 2100, receivedAtMs: 3000, timingSource: 'estimated' },
    { role: 'tutor', text: 'Hoi!', sequence: 1, startMs: 2150, endMs: 5000, receivedAtMs: 3100 },
    { role: 'user', text: 'ja', sequence: 2, startMs: 5100, endMs: 5300, receivedAtMs: 3200, timingSource: 'audio' },
  ];
  assert.deepEqual(groupTranscriptFragments(parts).map(group => group.text), ['Hallo', 'Hoi!', 'ja']);
});
