import type { RealtimeConnectionState, RealtimeServerEvent } from './types';

type RealtimeClientOptions = {
  apiBase: string;
  word: string;
  instructions: string;
  onEvent?: (event: RealtimeServerEvent) => void;
  onStateChange?: (state: RealtimeConnectionState) => void;
  onDebug?: (line: string) => void;
};

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private debugStartedAt = 0;
  private openerTimer: number | null = null;
  private openerSuppressed = false;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  private debug(label: string): void {
    const line = `+${Math.round(performance.now() - this.debugStartedAt)}ms ${label}`;
    console.debug('[realtime]', line);
    this.options.onDebug?.(line);
  }

  private suppressDelayedOpener(reason: string): void {
    if (this.openerSuppressed) return;
    this.openerSuppressed = true;
    if (this.openerTimer !== null) {
      window.clearTimeout(this.openerTimer);
      this.openerTimer = null;
    }
    this.debug(`delayed_opener.suppressed:${reason}`);
  }

  private setMicEnabled(enabled: boolean, reason: string): void {
    const tracks = this.localStream?.getAudioTracks() ?? [];
    let changed = false;
    tracks.forEach(track => {
      if (track.enabled !== enabled) {
        track.enabled = enabled;
        changed = true;
      }
    });
    if (changed) this.debug(`mic.${enabled ? 'unmuted' : 'muted'}:${reason}`);
  }

  async connect(): Promise<void> {
    this.debugStartedAt = performance.now();
    this.openerSuppressed = false;
    this.openerTimer = null;
    this.options.onStateChange?.('requesting-microphone');
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.options.onStateChange?.('connecting');

    try {
      const tokenResponse = await fetch(`${this.options.apiBase}/realtime-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: this.options.word,
          instructions: this.options.instructions,
        }),
      });
      if (!tokenResponse.ok) throw new Error(`Realtime token failed (${tokenResponse.status})`);

      const tokenData = await tokenResponse.json() as {
        value?: string;
        client_secret?: { value?: string };
      };
      const ephemeralKey = tokenData.value ?? tokenData.client_secret?.value;
      if (!ephemeralKey) throw new Error('Realtime token response did not contain a client secret');

      const pc = new RTCPeerConnection();
      this.peerConnection = pc;

      const audio = document.createElement('audio');
      audio.autoplay = true;
      this.remoteAudio = audio;
      pc.ontrack = event => { audio.srcObject = event.streams[0]; };
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

      const dc = pc.createDataChannel('oai-events');
      this.dataChannel = dc;
      dc.addEventListener('open', () => {
        this.debug('data_channel.open');
        // Let the fresh microphone/WebRTC pipeline settle before the AI-first
        // opening turn. If VAD or the server becomes active first, do not add a
        // second forced response on top of that activity.
        this.openerTimer = window.setTimeout(() => {
          this.openerTimer = null;
          if (!this.openerSuppressed && this.dataChannel === dc && dc.readyState === 'open') {
            this.debug('ready');
            this.options.onStateChange?.('ready');
          }
        }, 1200);
      });
      dc.addEventListener('message', event => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeServerEvent;
          this.debug(parsed.type);

          // iPhone speaker playback can leak back into the microphone strongly
          // enough to trigger server VAD. The server then treats the echo as a
          // barge-in and clears/truncates the assistant audio. Temporarily stop
          // sending microphone audio for the exact playout window; re-enable it
          // as soon as the output buffer reports that playback has stopped.
          if (parsed.type === 'output_audio_buffer.started') {
            this.setMicEnabled(false, 'assistant_playback');
          } else if (parsed.type === 'output_audio_buffer.stopped') {
            this.setMicEnabled(true, 'assistant_playback_stopped');
          }

          if (parsed.type === 'input_audio_buffer.speech_started' || parsed.type === 'response.created') {
            this.suppressDelayedOpener(parsed.type);
          }
          this.options.onEvent?.(parsed);
        } catch {
          // Ignore malformed diagnostic events instead of breaking the session.
        }
      });
      dc.addEventListener('close', () => this.options.onStateChange?.('closed'));

      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') this.options.onStateChange?.('error');
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });
      if (!sdpResponse.ok) throw new Error(`Realtime WebRTC handshake failed (${sdpResponse.status})`);

      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });
    } catch (error) {
      this.disconnect();
      this.options.onStateChange?.('error');
      throw error;
    }
  }

  send(event: Record<string, unknown>): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Realtime data channel is not open');
    }
    this.debug(`send:${String(event.type || 'unknown')}`);
    this.dataChannel.send(JSON.stringify(event));
  }

  disconnect(): void {
    if (this.openerTimer !== null) {
      window.clearTimeout(this.openerTimer);
      this.openerTimer = null;
    }
    this.openerSuppressed = true;
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.localStream?.getTracks().forEach(track => track.stop());
    if (this.remoteAudio) this.remoteAudio.srcObject = null;
    this.dataChannel = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteAudio = null;
  }
}
