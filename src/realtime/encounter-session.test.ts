import assert from 'node:assert/strict';
import test from 'node:test';
import { EncounterSession } from './encounter-session.ts';
import type { Encounter } from './types.ts';

function encounterFixture(targetWord = 'tegenvallen'): Encounter {
  return {
    id: 'test-encounter',
    targetWord,
    title: 'Test encounter',
    emoji: '💬',
    setup: 'A short test situation.',
    objective: 'Express the intended idea.',
    openingLine: 'En, hoe was het?',
    support: {
      meaning: 'Say it was worse than expected.',
      chunks: ['viel', 'tegen'],
      frame: 'Het ___ een beetje ___.',
      model: 'Het viel een beetje tegen.',
    },
  };
}

test('session records support escalation independently from current UI support', () => {
  const session = new EncounterSession(encounterFixture());
  session.requestMoreSupport();
  session.requestMoreSupport();
  session.hideSupport();

  assert.equal(session.currentSupport, 'none');
  assert.equal(session.evidence.maxSupportUsed, 'chunks');
});

test('records an explicit target-word production', () => {
  const session = new EncounterSession(encounterFixture());
  assert.equal(session.recordProduction('Ik wil tegenvallen hier gebruiken.'), true);
  assert.equal(session.evidence.successfulProduction, true);
});

test('records the separable past-tense form used by the encounter', () => {
  const session = new EncounterSession(encounterFixture());
  assert.equal(session.recordProduction('De taart viel een beetje tegen.'), true);
  assert.equal(session.evidence.learnerSentence, 'De taart viel een beetje tegen.');
});
