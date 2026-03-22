/**
 * Poortaal API Worker
 * 
 * Endpoints:
 * - POST /openai       — Proxy chat completions to OpenAI
 * - GET  /tts          — Proxy TTS via Google Translate
 * - POST /realtime-token — Generate ephemeral token for OpenAI Realtime API
 */

interface Env {
  OPENAI_API_KEY: string;
  CORS_ORIGIN: string;
}

function corsHeaders(origin: string, allowedOrigin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': allowedOrigin === '*' ? '*' : origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function handleCors(request: Request, env: Env): Response | null {
  const origin = request.headers.get('Origin') || '';
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders(origin, env.CORS_ORIGIN),
    });
  }
  return null;
}

// POST /openai — proxy to OpenAI chat completions
async function handleOpenAI(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /tts — proxy TTS via Google Translate
async function handleTTS(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const text = url.searchParams.get('q') || '';
  const lang = url.searchParams.get('tl') || 'nl';

  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
  
  const response = await fetch(ttsUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!response.ok) {
    return new Response('TTS failed', { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

// POST /realtime-token — generate ephemeral token for OpenAI Realtime API
async function handleRealtimeToken(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { word?: string; instructions?: string };
  const word = body.word || '';

  const instructions = body.instructions || `You are a friendly Dutch language tutor having a real-time voice conversation. The student is practicing the word "${word}".

Your behavior:
1. Speak primarily in Dutch, with occasional English support in parentheses for harder words.
2. Start by setting up a short, fun real-life scenario where the student must use "${word}" naturally.
3. Keep your responses short (1-2 sentences). This is a conversation, not a lecture.
4. After the student uses the word correctly, give brief encouraging feedback, then continue or wrap up.
5. Be warm, patient, and encouraging. Speak at a natural but slightly slower pace.
6. If the student struggles, offer hints in English.`;

  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expires_after: {
        anchor: 'created_at',
        seconds: 120,
      },
      session: {
        type: 'realtime',
        model: 'gpt-4o-realtime-preview',
        instructions,
        audio: {
          input: {
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1000,
              create_response: false,
            },
            transcription: {
              model: 'whisper-1',
            },
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
    const error = await response.text();
    return new Response(JSON.stringify({ error: 'Failed to create realtime session', details: error }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsResponse = handleCors(request, env);
    if (corsResponse) return corsResponse;

    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname;

    let response: Response;

    try {
      if (path === '/openai' && request.method === 'POST') {
        response = await handleOpenAI(request, env);
      } else if (path === '/tts' && request.method === 'GET') {
        response = await handleTTS(request);
      } else if (path === '/realtime-token' && request.method === 'POST') {
        response = await handleRealtimeToken(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      response = new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add CORS headers to response
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders(origin, env.CORS_ORIGIN)).forEach(([k, v]) => {
      headers.set(k, v);
    });

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  },
};
