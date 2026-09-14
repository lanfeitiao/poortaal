import assert from 'node:assert/strict';
import test from 'node:test';
import { nextSupportLevel, previousSupportLevel, strongerSupport } from './scaffolding.ts';

test('rescue ladder increases support one step at a time', () => {
  assert.equal(nextSupportLevel('none'), 'meaning');
  assert.equal(nextSupportLevel('meaning'), 'chunks');
  assert.equal(nextSupportLevel('chunks'), 'frame');
  assert.equal(nextSupportLevel('frame'), 'model');
  assert.equal(nextSupportLevel('model'), 'model');
});

test('support can be reduced', () => {
  assert.equal(previousSupportLevel('model'), 'frame');
  assert.equal(previousSupportLevel('none'), 'none');
});

test('max support evidence keeps the strongest scaffold used', () => {
  assert.equal(strongerSupport('meaning', 'frame'), 'frame');
  assert.equal(strongerSupport('model', 'chunks'), 'model');
});
