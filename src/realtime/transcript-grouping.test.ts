import assert from 'node:assert/strict';
import test from 'node:test';
import { findTranscriptGroupIndex, type TimedTranscript } from './transcript-grouping.ts';

test('late earlier fragment rejoins its same-speaker bubble', () => {
  const messages: TimedTranscript[] = [
    { role: 'tutor', startMs: 900, endMs: 1400 },
    { role: 'user', startMs: 1800, endMs: 2100 },
  ];
  assert.equal(findTranscriptGroupIndex(messages, { role: 'tutor', startMs: 500, endMs: 950 }), 0);
});

test('opposite speech between fragments starts a new bubble', () => {
  const messages: TimedTranscript[] = [
    { role: 'user', startMs: 0, endMs: 1000 },
    { role: 'tutor', startMs: 900, endMs: 1300 },
  ];
  assert.equal(findTranscriptGroupIndex(messages, { role: 'user', startMs: 1400, endMs: 1600 }), -1);
});

test('overlapping same-speaker fragments stay together during full duplex speech', () => {
  const messages: TimedTranscript[] = [
    { role: 'user', startMs: 0, endMs: 1000 },
    { role: 'tutor', startMs: 900, endMs: 1100 },
  ];
  assert.equal(findTranscriptGroupIndex(messages, { role: 'user', startMs: 950, endMs: 1400 }), 0);
});

test('a short pause without another speaker stays in one bubble', () => {
  const messages: TimedTranscript[] = [
    { role: 'user', startMs: 1000, endMs: 1500 },
  ];
  assert.equal(findTranscriptGroupIndex(messages, { role: 'user', startMs: 2600, endMs: 2900 }), 0);
});

test('a long silence starts a new bubble', () => {
  const messages: TimedTranscript[] = [
    { role: 'user', startMs: 1000, endMs: 1500 },
  ];
  assert.equal(findTranscriptGroupIndex(messages, { role: 'user', startMs: 4000, endMs: 4300 }), -1);
});
