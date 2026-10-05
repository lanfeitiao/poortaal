import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { RealtimeClient } from './realtime-client.ts';

function replaceGlobal(t: TestContext, name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function clientFixture(t: TestContext) {
  let stopped = 0;
  const track = { enabled: true, stop: () => { stopped++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  let getMic = () => Promise.resolve(stream);
  let answer = () => Promise.resolve(Response.json({ transport: { type: 'webrtc', sdp: 'answer' } }));
  class Channel extends EventTarget {
    readyState = 'open';
    send() {}
    close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
    emit(type: string) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type }) })); }
  }
  const channel = new Channel();
  let remoteDescriptions = 0;
  class Peer extends EventTarget {
    iceGatheringState = 'complete';
    connectionState = 'new';
    localDescription = { type: 'offer', sdp: 'offer' };
    addTrack() { assert.equal(track.enabled, false); }
    createDataChannel() { return channel; }
    createOffer() { return Promise.resolve(this.localDescription); }
    setLocalDescription() { return Promise.resolve(); }
    setRemoteDescription() { remoteDescriptions++; return Promise.resolve(); }
    close() { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')); }
  }
  replaceGlobal(t, 'navigator', { mediaDevices: { getUserMedia: () => getMic() } });
  replaceGlobal(t, 'RTCPeerConnection', Peer);
  replaceGlobal(t, 'document', { createElement: () => ({ autoplay: false, srcObject: null }) });
  t.mock.method(globalThis, 'fetch', () => answer());
  const states: string[] = [];
  const client = new RealtimeClient({ apiBase: '/api', word: 'nieuwsgierig', instructions: 'prompt', onStateChange: state => states.push(state) });
  t.after(() => client.disconnect());
  return { client, channel, track, states, stream, stopped: () => stopped,
    remoteDescriptions: () => remoteDescriptions,
    setMic: (fn: typeof getMic) => { getMic = fn; },
    setAnswer: (fn: typeof answer) => { answer = fn; } };
}

test('the opening starts once and closed-session events cannot restart it', async (t) => {
  const fixture = clientFixture(t);
  await fixture.client.connect();
  fixture.channel.emit('session.started');
  fixture.channel.emit('session.started');
  assert.equal(fixture.states.filter(state => state === 'ready').length, 1);
  assert.equal(fixture.track.enabled, false);
  fixture.client.disconnect();
  assert.equal(fixture.stopped(), 1);
  fixture.channel.emit('session.started');
  assert.equal(fixture.states.filter(state => state === 'ready').length, 1);
  assert.equal(fixture.track.enabled, false);
});

test('a microphone granted after Stop is released without creating a new session', async (t) => {
  const fixture = clientFixture(t);
  let grant!: (stream: MediaStream) => void;
  fixture.setMic(() => new Promise(resolve => { grant = resolve; }));
  const connecting = fixture.client.connect();
  fixture.client.disconnect();
  grant(fixture.stream);
  await connecting;
  assert.equal(fixture.stopped(), 1);
  assert.equal(fixture.remoteDescriptions(), 0);
  assert.deepEqual(fixture.states, ['requesting-microphone']);
});

test('a canceled permission failure does not surface as a new-session error', async (t) => {
  const fixture = clientFixture(t);
  let deny!: (reason: Error) => void;
  fixture.setMic(() => new Promise((_, reject) => { deny = reject; }));
  const connecting = fixture.client.connect();
  fixture.client.disconnect();
  deny(new Error('Permission denied'));
  await connecting;
  assert.deepEqual(fixture.states, ['requesting-microphone']);
});

test('a late session response cannot attach audio after Stop', async (t) => {
  const fixture = clientFixture(t);
  let respond!: (response: Response) => void;
  let requested!: () => void;
  const requestStarted = new Promise<void>(resolve => { requested = resolve; });
  fixture.setAnswer(() => new Promise(resolve => { respond = resolve; requested(); }));
  const connecting = fixture.client.connect();
  await requestStarted;
  fixture.client.disconnect();
  respond(Response.json({ transport: { type: 'webrtc', sdp: 'late-answer' } }));
  await connecting;
  assert.equal(fixture.stopped(), 1);
  assert.equal(fixture.remoteDescriptions(), 0);
});

test('a server close cancels the opening guard and releases the microphone', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = clientFixture(t);
  await fixture.client.connect();
  fixture.channel.emit('session.started');
  fixture.channel.emit('session.closed');
  t.mock.timers.tick(25_000);
  assert.equal(fixture.stopped(), 1);
  assert.equal(fixture.track.enabled, false);
  assert.equal(fixture.states.at(-1), 'closed');
});
