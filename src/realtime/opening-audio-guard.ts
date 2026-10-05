// Keep the WebRTC input track sending silence during the tutor's opening.
// GPT-Live has no output-audio-done event, so observe audio, not captions.
export class OpeningAudioGuard {
  private released = false;
  private started = false;
  private lastSoundMs: number | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly stream: MediaStream, private readonly onReleased: () => void) {
    this.stream.getAudioTracks().forEach(track => { track.enabled = false; });
  }

  start(): void {
    if (this.started || this.released) return;
    this.started = true;
    // An unsupported/suspended analyser or missing greeting must not trap the mic.
    this.timeout = setTimeout(() => {
      console.warn('Opening audio protection timed out; resuming microphone input.');
      this.release();
    }, 20_000);
  }

  watch(remoteStream: MediaStream): void {
    if (this.released || this.context) return;
    try {
      const context = new AudioContext();
      this.context = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      this.source = context.createMediaStreamSource(remoteStream);
      this.source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      this.interval = setInterval(() => {
        if (!this.started || context.state !== 'running') return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        this.observe(rms, performance.now());
      }, 50);
      void context.resume().catch(() => this.release());
    } catch {
      console.warn('Opening audio protection unavailable; relying on browser echo cancellation.');
      this.release();
    }
  }

  observe(rms: number, nowMs: number): void {
    if (!this.started || this.released) return;
    if (rms >= 0.008) this.lastSoundMs = nowMs;
    // Allow short pauses in the question and a little time for speaker echo to decay.
    else if (this.lastSoundMs !== null && nowMs - this.lastSoundMs >= 700) this.release();
  }

  dispose(): void {
    this.released = true;
    this.cleanup();
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    this.cleanup();
    this.stream.getAudioTracks().forEach(track => { track.enabled = true; });
    this.onReleased();
  }

  private cleanup(): void {
    if (this.interval !== null) clearInterval(this.interval);
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.interval = this.timeout = null;
    this.source?.disconnect();
    this.source = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
