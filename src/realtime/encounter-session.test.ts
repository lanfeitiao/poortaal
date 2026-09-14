import assert from 'node:assert/strict';
import test from 'node:test';
import { createMvpEncounter } from './encounter.ts';
import { EncounterSession } from './encounter-session.ts';

test('session records support escalation independently from current UI support', () => {
  const session = new EncounterSession(createMvpEncounter('tegenvallen'));
  session.requestMoreSupport();
  session.requestMoreSupport();
  session.hideSupport();

  assert.equal(session.currentSupport, 'none');
  assert.equal(session.evidence.maxSupportUsed, 'chunks');
});

test('records an explicit target-word production', () => {
  const session = new EncounterSession(createMvpEncounter('tegenvallen'));
  assert.equal(session.recordProduction('Ik wil tegenvallen hier gebruiken.'), true);
  assert.equal(session.evidence.successfulProduction, true);
});

test('records the separable past-tense form used by the MVP encounter', () => {
  const session = new EncounterSession(createMvpEncounter('tegenvallen'));
  assert.equal(session.recordProduction('De taart viel een beetje tegen.'), true);
  assert.equal(session.evidence.learnerSentence, 'De taart viel een beetje tegen.');
});
