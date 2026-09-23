/**
 * Poortaal API Worker
 *
 * Endpoints:
 * - POST /openai         — Proxy chat completions to OpenAI
 * - GET  /tts            — Proxy TTS via Google Translate
 * - POST /realtime-token — Generate ephemeral token for OpenAI Realtime API
 */

interface Env {
  OPENAI_API_KEY: string;
  CORS_ORIGIN: string;
}

function allowedCorsOrigin(origin: string, configuredOrigin: string): string | null {
  if (configuredOrigin === '*') return '*';
  if (origin === configuredOrigin) return origin;

  // Allow Poortaal's Vercel branch previews so Realtime V2 can be tested
  // before merging to GitHub Pages. Keep this scoped to this Vercel project.
  if (/^https:\/\/poortaal-git-[a-z0-9-]+-lanfeitiaos-projects\.vercel\.app$/.test(origin)) {
    return origin;
  }

  return null;
}

function corsHeaders(origin: string, configuredOrigin: string): HeadersInit {
  const allowedOrigin = allowedCorsOrigin(origin, configuredOrigin);
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function handleCors(request: Request, env: Env): Response | null {
  const origin = request.headers.get('Origin') || '';
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin, env.CORS_ORIGIN) });
  }
  return null;
}

async function handleOpenAI(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return new Response(JSON.stringify(await response.json()), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleTTS(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const text = url.searchParams.get('q') || '';
  const lang = url.searchParams.get('tl') || 'nl';
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
  const response = await fetch(ttsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) return new Response('TTS failed', { status: 502 });
  return new Response(response.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' },
  });
}

async function handleRealtimeToken(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { word?: string; instructions?: string };
  const word = body.word || '';
  const instructions = body.instructions || `You are a Dutch conversation partner. Create one short, achievable opportunity for the learner to use “${word}”. Keep turns short and do not volunteer hints; the client UI owns scaffolding.`;

  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 120 },
      session: {
        type: 'realtime',
        model: 'gpt-realtime-1.5',
        instructions,
        max_output_tokens: 160,
        audio: {
          input: {
            noise_reduction: { type: 'far_field' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.8,
              prefix_padding_ms: 500,
              silence_duration_ms: 1500,
              create_response: true,
              interrupt_response: false,
            },
            transcription: { model: 'gpt-realtime-whisper' },
          },
          output: {
            voice: 'alloy',
            speed: 0.9,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    return new Response(JSON.stringify({ error: 'Failed to create realtime session', details }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(await response.json()), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsResponse = handleCors(request, env);
    if (corsResponse) return corsResponse;

    const origin = request.headers.get('Origin') || '';
    const path = new URL(request.url).pathname;
    let response: Response;

    try {
      if (path === '/openai' && request.method === 'POST') response = await handleOpenAI(request, env);
      else if (path === '/tts' && request.method === 'GET') response = await handleTTS(request);
      else if (path === '/realtime-token' && request.method === 'POST') response = await handleRealtimeToken(request, env);
      else response = new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      response = new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers(response.headers);
    Object.entries(corsHeaders(origin, env.CORS_ORIGIN)).forEach(([key, value]) => headers.set(key, value));
    return new Response(response.body, { status: response.status, headers });
  },
};
