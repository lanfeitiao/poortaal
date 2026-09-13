import assert from 'node:assert/strict';
import test from 'node:test';
import { createMvpEncounter } from './encounter';
import { EncounterSession } from './encounter-session';

test('session records support escalation independently from current UI support', () => {
  const session = new EncounterSession(createMvpEncounter('tegenvallen'));
  session.requestMoreSupport();
  session.requestMoreSupport();
  session.hideSupport();

  assert.equal(session.currentSupport, 'none');
  assert.equal(session.evidence.maxSupportUsed, 'chunks');
});

test('session records a learner sentence containing the target word', () => {
  const session = new EncounterSession(createMvpEncounter('tegenvallen'));
  assert.equal(session.recordProduction('De taart viel een beetje tegen.'), false);
});
