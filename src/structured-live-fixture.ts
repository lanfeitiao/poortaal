import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'vite';
import { parseHTML } from 'linkedom';
import { goodFeedback, practiceUsage, scenario } from './structured-fixtures.ts';

export async function liveFixture(t: TestContext, scenarioReply?: (input: Record<string, unknown>) => unknown | Promise<unknown>) {
  const { document, window: dom } = parseHTML(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
  const events = new EventTarget() as EventTarget & Record<string, unknown>;
  events.location = { hash: '#practice', href: 'http://localhost/#practice' };
  events.supabase = { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => {} } }) };
  const word = { word: 'afspraak', type: 'zelfstandig naamwoord', meaning_nl: 'Een plan om iemand te zien.', meaning_en: 'appointment',
    examples: [{ nl: practiceUsage.example_nl, en: practiceUsage.example_en }], tips: '', fun_fact: null, usage: [practiceUsage],
    scene: { version: 2, generatedAt: 1, sense: 'appointment', usage: practiceUsage.chunk, scenario } };
  const storage = new Map<string, string>([['poortaal_word_cache_v4', JSON.stringify({ afspraak: word })],
    ['poortaal_history', JSON.stringify([{ word: 'afspraak', timestamp: 1, wordData: word }])]]);
  const track = { enabled: true, stop() {} };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const sent: Record<string, unknown>[] = [];
  class Channel extends EventTarget {
    readyState = 'open';
    send(raw: string) { sent.push(JSON.parse(raw)); }
    close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
    emit(type: string, data = {}) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, ...data }) })); }
  }
  let channel: Channel;
  class Peer extends EventTarget {
    ontrack?: (event: unknown) => void;
    iceGatheringState = 'complete'; connectionState = 'new'; localDescription = { type: 'offer', sdp: 'offer' };
    addTrack() {} createDataChannel() { channel = new Channel(); return channel; }
    createOffer() { return Promise.resolve(this.localDescription); } setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() {
      channel.emit('session.started'); this.ontrack?.({ streams: [stream] }); return Promise.resolve();
    }
    close() { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')); }
  }
  for (const [key, value] of Object.entries({ document, window: events, Node: dom.Node, MutationObserver: dom.MutationObserver,
    CSS: { escape: (v: string) => v }, RTCPeerConnection: Peer, navigator: { mediaDevices: { getUserMedia: async () => stream } },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } })) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url === 'words.json') return Response.json([]);
    if (String(url).endsWith('/live-session')) return Response.json({ transport: { type: 'webrtc', sdp: 'answer' } });
    assert.ok(String(url).endsWith('/openai'));
    const input = JSON.parse(JSON.parse(init!.body as string).messages[1].content);
    const reply = input.answer ? goodFeedback(input.situation, input.answer) : scenarioReply ? await scenarioReply(input) : scenario;
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  });
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false } });
  const output = Array.isArray(result) ? result[0].output : 'output' in result ? result.output : [];
  const code = output.find(chunk => chunk.type === 'chunk'); assert.ok(code && 'code' in code);
  await import(`data:text/javascript;base64,${Buffer.from(code.code).toString('base64')}#${crypto.randomUUID()}`);
  document.dispatchEvent(new dom.Event('DOMContentLoaded'));
  const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
  t.after(() => click('#practiceBackBtn'));
  let clock = 0;
  return { document, storage, sent, track, events, click,
    closeConnection() { channel.emit('session.closed'); },
    caption(role: 'user' | 'tutor', delta: string) { clock += 1000; channel.emit(`session.${role === 'user' ? 'input' : 'output'}_transcript.delta`, { delta, start_ms: clock, end_ms: clock + 500 }); },
    async wait(check: () => boolean) {
      for (let i = 0; !check() && i < 220; i++) await new Promise(r => setTimeout(r, 20));
      assert.ok(check());
    },
    session() { const data = JSON.parse(storage.get('poortaal_structured_practice:guest') || '{}'); return data.sessions?.find(s => s.id === data.active); },
    attempts() { return JSON.parse(storage.get('poortaal_word_learning:guest') || '{}').afspraak || []; },
  };
}
