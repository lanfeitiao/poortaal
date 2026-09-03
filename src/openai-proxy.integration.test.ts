import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker/src/index.ts';
import {
  OpenAIRequestError,
  requestOpenAIChat,
} from './openai-client.ts';
import type { ChatMessage } from './word-explanation.ts';

const messages: ChatMessage[] = [
  { role: 'user', content: 'gezellig' },
];

const env = {
  OPENAI_API_KEY: 'test-key',
  CORS_ORIGIN: '*',
};

test('worker preserves upstream HTTP status for client classification', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const workerFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(input, init);
    return worker.fetch(request, env);
  };

  for (const status of [429, 500]) {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error: { message: `upstream ${status}` } }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    await assert.rejects(
      () => requestOpenAIChat(
        'https://poortaal.test',
        messages,
        0.7,
        workerFetch,
      ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAIRequestError);
        assert.equal(error.kind, 'http');
        assert.equal(error.status, status);
        return true;
      },
    );
  }
});
