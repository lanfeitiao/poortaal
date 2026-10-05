import type { RealtimeConnectionState, RealtimeServerEvent } from './types';
import { OpeningAudioGuard } from './opening-audio-guard.ts';

type RealtimeClientOptions = {
  apiBase: string;
  word: string;
  instructions: string;
  backendInstructions?: string;
  onEvent?: (event: RealtimeServerEvent) => void;
  onStateChange?: (state: RealtimeConnectionState) => void;
};

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private openingGuard: OpeningAudioGuard | null = null;
  private connectionId = 0;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    const connectionId = ++this.connectionId;
    let readyReported = false;
    this.options.onStateChange?.('requesting-microphone');
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    }).catch((error: unknown) => {
      if (connectionId !== this.connectionId) return null;
      throw error;
    });
    if (!localStream) return;
    if (connectionId !== this.connectionId) {
      localStream.getTracks().forEach(track => track.stop());
      return;
    }
    this.localStream = localStream;
    this.openingGuard = new OpeningAudioGuard(localStream, () => {
      if (connectionId === this.connectionId && readyReported) this.options.onStateChange?.('listening');
    });
    this.options.onStateChange?.('connecting');

    try {
      const pc = new RTCPeerConnection();
      this.peerConnection = pc;

      const audio = document.createElement('audio');
      audio.autoplay = true;
      this.remoteAudio = audio;
      pc.ontrack = event => {
        if (connectionId !== this.connectionId) return;
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        audio.srcObject = remoteStream;
        this.openingGuard?.watch(remoteStream);
      };
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream!));

      const dc = pc.createDataChannel('oai-events');
      this.dataChannel = dc;
      dc.addEventListener('message', event => {
        if (connectionId !== this.connectionId) return;
        try {
          const parsed = JSON.parse(event.data) as RealtimeServerEvent;
          if (parsed.type === 'session.started' && !readyReported) {
            readyReported = true;
            this.openingGuard?.start();
            this.options.onStateChange?.('ready');
          }
          if (parsed.type === 'session.closed') {
            this.disconnect();
            this.options.onStateChange?.('closed');
          }
          this.options.onEvent?.(parsed);
        } catch {
          // Ignore malformed diagnostic events instead of breaking the session.
        }
      });
      dc.addEventListener('close', () => {
        if (connectionId !== this.connectionId) return;
        this.disconnect();
        this.options.onStateChange?.('closed');
      });

      pc.addEventListener('connectionstatechange', () => {
        if (connectionId === this.connectionId && pc.connectionState === 'failed') {
          this.disconnect();
          this.options.onStateChange?.('error');
        }
      });

      const offer = await pc.createOffer();
      if (connectionId !== this.connectionId) return;
      await pc.setLocalDescription(offer);
      if (connectionId !== this.connectionId) return;
      await this.waitForIceGatheringComplete(pc);
      if (connectionId !== this.connectionId) return;

      const sessionResponse = await fetch(`${this.options.apiBase}/live-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sdp: pc.localDescription?.sdp,
          word: this.options.word,
          instructions: this.options.instructions,
          backendInstructions: this.options.backendInstructions ?? this.options.instructions,
        }),
      });
      if (connectionId !== this.connectionId) return;
      if (!sessionResponse.ok) throw new Error(`GPT-Live session failed (${sessionResponse.status})`);

      const data = await sessionResponse.json() as {
        transport?: { type?: string; sdp?: string };
      };
      if (connectionId !== this.connectionId) return;
      if (data.transport?.type !== 'webrtc' || !data.transport.sdp) {
        throw new Error('GPT-Live response did not contain a WebRTC answer');
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: data.transport.sdp });
    } catch (error) {
      if (connectionId !== this.connectionId) return;
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
    this.connectionId += 1;
    this.openingGuard?.dispose();
    this.openingGuard = null;
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'session.close' }));
    }
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.localStream?.getTracks().forEach(track => track.stop());
    if (this.remoteAudio) this.remoteAudio.srcObject = null;
    this.dataChannel = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteAudio = null;
  }

  private waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete' || pc.connectionState === 'closed') return Promise.resolve();
    return new Promise(resolve => {
      const onStateChange = () => {
        if (pc.iceGatheringState !== 'complete' && pc.connectionState !== 'closed') return;
        pc.removeEventListener('icegatheringstatechange', onStateChange);
        pc.removeEventListener('connectionstatechange', onStateChange);
        resolve();
      };
      pc.addEventListener('icegatheringstatechange', onStateChange);
      pc.addEventListener('connectionstatechange', onStateChange);
    });
  }
}
