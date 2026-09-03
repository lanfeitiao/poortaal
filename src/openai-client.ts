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

export async function requestOpenAIChat(
  apiBase: string,
  messages: ChatMessage[],
  temperature = 0.7,
  fetchImpl: Fetcher = fetch,
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

  const data = await response.json() as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Invalid OpenAI response');
  }

  return content;
}
