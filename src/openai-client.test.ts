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

test('retries HTTP 429 once and succeeds', async () => {
  let calls = 0;
  const result = await requestOpenAIChat(
    'https://example.test',
    messages,
    0.7,
    async () => {
      calls++;
      if (calls === 1) return jsonResponse({ error: 'rate limited' }, 429);
      return jsonResponse({ choices: [{ message: { content: 'hello' } }] });
    },
  );

  assert.equal(result, 'hello');
  assert.equal(calls, 2);
});

test('retries HTTP 500 once and preserves the second failure', async () => {
  let calls = 0;

  await assert.rejects(
    () => requestOpenAIChat(
      'https://example.test',
      messages,
      0.7,
      async () => {
        calls++;
        return jsonResponse({ error: 'server error' }, 500);
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIRequestError);
      assert.equal(error.kind, 'http');
      assert.equal(error.status, 500);
      return true;
    },
  );

  assert.equal(calls, 2);
});

test('retries a network failure once and succeeds', async () => {
  let calls = 0;
  const result = await requestOpenAIChat(
    'https://example.test',
    messages,
    0.7,
    async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return jsonResponse({ choices: [{ message: { content: 'hello' } }] });
    },
  );

  assert.equal(result, 'hello');
  assert.equal(calls, 2);
});

test('retries a network failure while reading the response body', async () => {
  let calls = 0;
  const bodyError = new TypeError('body stream interrupted');

  const result = await requestOpenAIChat(
    'https://example.test',
    messages,
    0.7,
    async () => {
      calls++;
      if (calls === 1) {
        const response = jsonResponse({ choices: [{ message: { content: 'ignored' } }] });
        response.json = async () => {
          throw bodyError;
        };
        return response;
      }
      return jsonResponse({ choices: [{ message: { content: 'hello' } }] });
    },
  );

  assert.equal(result, 'hello');
  assert.equal(calls, 2);
});

test('does not retry malformed JSON response bodies', async () => {
  let calls = 0;

  await assert.rejects(
    () => requestOpenAIChat(
      'https://example.test',
      messages,
      0.7,
      async () => {
        calls++;
        return new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'Invalid OpenAI response');
      return true;
    },
  );

  assert.equal(calls, 1);
});

test('does not retry a non-retryable HTTP 400 failure', async () => {
  let calls = 0;

  await assert.rejects(
    () => requestOpenAIChat(
      'https://example.test',
      messages,
      0.7,
      async () => {
        calls++;
        return jsonResponse({ error: 'bad request' }, 400);
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIRequestError);
      assert.equal(error.kind, 'http');
      assert.equal(error.status, 400);
      return true;
    },
  );

  assert.equal(calls, 1);
});

test('preserves the final network failure after one retry', async () => {
  let calls = 0;
  const firstError = new TypeError('first fetch failed');
  const finalError = new TypeError('second fetch failed');

  await assert.rejects(
    () => requestOpenAIChat(
      'https://example.test',
      messages,
      0.7,
      async () => {
        calls++;
        throw calls === 1 ? firstError : finalError;
      },
    ),
    (error: unknown) => {
      assert.ok(error instanceof OpenAIRequestError);
      assert.equal(error.kind, 'network');
      assert.equal(error.status, null);
      assert.equal(error.originalError, finalError);
      return true;
    },
  );

  assert.equal(calls, 2);
});
