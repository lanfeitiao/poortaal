import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OpenAIRequestError,
  requestOpenAIChat,
} from './openai-client.ts';

const messages = [
  { role: 'user' as const, content: 'gezellig' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('returns chat content for a successful response', async () => {
  const result = await requestOpenAIChat(
    'https://example.test',
    messages,
    0.7,
    async () => jsonResponse({
      choices: [{ message: { content: 'hello' } }],
    }),
  );

  assert.equal(result, 'hello');
});

test('preserves HTTP 429 status', async () => {
  await assert.rejects(
    () => requestOpenAIChat(
      'https://example.test',
      messages,
      0.7,
      async () => jsonResponse({ error: 'rate limited' }, 429),
    ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIRequestError);
      assert.equal(error.kind, 'http');
      assert.equal(error.status, 429);
      return true;
    },
  );
});

test('preserves HTTP 500 status', async () => {
  await assert.rejects(
    () => requestOpenAIChat(
      'https://example.test',
      messages,
      0.7,
      async () => jsonResponse({ error: 'server error' }, 500),
    ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIRequestError);
      assert.equal(error.kind, 'http');
      assert.equal(error.status, 500);
      return true;
    },
  );
});

test('preserves the original network failure', async () => {
  const originalError = new TypeError('fetch failed');

  await assert.rejects(
    () => requestOpenAIChat(
      'https://example.test',
      messages,
      0.7,
      async () => {
        throw originalError;
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIRequestError);
      assert.equal(error.kind, 'network');
      assert.equal(error.status, null);
      assert.equal(error.originalError, originalError);
      return true;
    },
  );
});
