import type { ChatMessage } from './word-explanation';

export type OpenAIRequestFailureKind = 'http' | 'network';

export class OpenAIRequestError extends Error {
  readonly kind: OpenAIRequestFailureKind;
  readonly status: number | null;
  readonly originalError: unknown;

  constructor(
    kind: OpenAIRequestFailureKind,
    options: { status?: number; originalError?: unknown } = {},
  ) {
    super('API error');
    this.name = 'OpenAIRequestError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.originalError = options.originalError;
  }
}

type Fetcher = typeof fetch;

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isRetryableOpenAIRequestError(error: unknown): boolean {
  if (!(error instanceof OpenAIRequestError)) return false;
  if (error.kind === 'network') return true;
  return error.status === 429 || (error.status !== null && error.status >= 500);
}

async function requestOpenAIChatOnce(
  apiBase: string,
  messages: ChatMessage[],
  temperature: number,
  fetchImpl: Fetcher,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${apiBase}/openai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature }),
    });
  } catch (error) {
    throw new OpenAIRequestError('network', { originalError: error });
  }

  if (!response.ok) {
    throw new OpenAIRequestError('http', { status: response.status });
  }

  let data: OpenAIChatResponse;
  try {
    data = await response.json() as OpenAIChatResponse;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid OpenAI response');
    }
    throw new OpenAIRequestError('network', { originalError: error });
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Invalid OpenAI response');
  }

  return content;
}

export async function requestOpenAIChat(
  apiBase: string,
  messages: ChatMessage[],
  temperature = 0.7,
  fetchImpl: Fetcher = fetch,
): Promise<string> {
  try {
    return await requestOpenAIChatOnce(apiBase, messages, temperature, fetchImpl);
  } catch (error) {
    if (!isRetryableOpenAIRequestError(error)) throw error;
  }

  await delay(RETRY_DELAY_MS);
  return requestOpenAIChatOnce(apiBase, messages, temperature, fetchImpl);
}
