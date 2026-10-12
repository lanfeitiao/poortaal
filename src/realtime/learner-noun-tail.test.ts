import assert from 'node:assert/strict';
import test from 'node:test';
import { groupTranscriptFragments, type TranscriptFragment } from './transcript-grouping.ts';

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
