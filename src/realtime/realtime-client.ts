import type { RealtimeConnectionState, RealtimeServerEvent } from './types';

type RealtimeClientOptions = {
  apiBase: string;
  word: string;
  instructions: string;
  onEvent?: (event: RealtimeServerEvent) => void;
  onStateChange?: (state: RealtimeConnectionState) => void;
};

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
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
        // Let the fresh microphone/WebRTC pipeline settle before the AI-first
        // opening turn. Hoiland naturally gets this gap while waiting for user input.
        window.setTimeout(() => {
          if (this.dataChannel === dc && dc.readyState === 'open') {
            this.options.onStateChange?.('ready');
          }
        }, 1200);
      });
      dc.addEventListener('message', event => {
        try {
          this.options.onEvent?.(JSON.parse(event.data) as RealtimeServerEvent);
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
    this.dataChannel.send(JSON.stringify(event));
  }

  disconnect(): void {
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
