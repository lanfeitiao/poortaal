import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWordUsage } from './word-usage.ts';
import { readSavedWordExplanation, validateWordExplanation, type WordExplanation } from './word-explanation.ts';
import { enrichWordUsage, mergeUsageEnrichment } from './usage-generation.ts';
import { renderWordUsage } from './word-usage-ui.ts';

const use = { chunk: 'een afspraak maken', meaning_en: 'make an appointment', frame: 'Ik wil een afspraak maken voor [tijd].', example_nl: 'Ik wil een afspraak maken voor donderdag.', example_en: 'I want to make an appointment for Thursday.', review_prompt: 'Arrange a time for an appointment.' };
const legacy: WordExplanation = { word: 'afspraak', type: 'zelfstandig naamwoord', meaning_nl: 'Een afgesproken tijd.', meaning_en: 'appointment', examples: [{ nl: 'Ik heb een afspraak.', en: 'I have an appointment.' }, { nl: 'Mijn afspraak is morgen.', en: 'My appointment is tomorrow.' }], tips: 'Use maken.', fun_fact: null };

test('legacy cached words remain valid without fabricated usage data', () => {
  assert.deepEqual(validateWordExplanation(legacy), legacy);
});
test('restoring history rejects corrupted usages before review or practice can read them', () => {
  assert.deepEqual(readSavedWordExplanation(legacy), legacy);
  assert.equal(readSavedWordExplanation({ ...legacy, usage: 'invalid' }), undefined);
});
test('new explanations validate attached uses and reject malformed or duplicated ones', () => {
  assert.deepEqual(validateWordExplanation({ ...legacy, usage: [use] }).usage, [use]);
  assert.throws(() => validateWordUsage([use, { ...use, chunk: '  Een afspraak maken  ' }]));
  assert.throws(() => validateWordExplanation({ ...legacy, usage: [{ ...use, frame: '' }] }));
  assert.deepEqual(validateWordUsage([]), []);
});
test('legacy enrichment keeps the original word, meaning, and examples', async () => {
  const enriched = await enrichWordUsage(legacy, async () => JSON.stringify({ word: 'other', meaning_en: 'wrong', usage: [use] }));
  assert.deepEqual(enriched, { ...legacy, usage: [use] });
});
test('existing uses are reused without another model request', async () => {
  const data = { ...legacy, usage: [use] };
  assert.equal(await enrichWordUsage(data, async () => { throw new Error('unnecessary request'); }), data);
});
test('late enrichment adds only missing usages to the latest word data', () => {
  const latest: WordExplanation = { ...legacy, meaning_nl: 'Nieuwe betekenis.', meaning_en: 'updated meaning',
    examples: [{ nl: 'De nieuwe afspraak is vrijdag.', en: 'The new appointment is Friday.' }, legacy.examples[1]], tips: 'Updated tips.' };
  const merged = mergeUsageEnrichment(latest, { ...legacy, usage: [use] });
  assert.deepEqual(merged, { ...latest, usage: [use] });
  assert.equal(merged.examples, latest.examples);
  assert.equal(latest.usage, undefined);
});
test('late enrichment preserves cloud usages including an explicitly empty list', () => {
  for (const usage of [[{ ...use, chunk: 'een afspraak verzetten' }], []]) {
    const latest = { ...legacy, usage };
    const merged = mergeUsageEnrichment(latest, { usage: [use] });
    assert.deepEqual(merged, latest);
    assert.equal(merged.usage, usage);
  }
});
test('model-generated HTML and quote characters stay text in word usage cards', () => {
  const html = renderWordUsage({ ...legacy, word: 'afspraak" onclick="alert(1)', usage: [{ ...use, frame: '<img src=x onerror=alert(1)>' }] });
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('afspraak&quot; onclick=&quot;alert(1)'));
  assert.ok(!html.includes('<img'));
});
