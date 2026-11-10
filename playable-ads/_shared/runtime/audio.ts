/**
 * Web Audio with the networks' rules: silent until the first touch (browsers block it before,
 * and every network requires it), muted while the ad is hidden.
 */
export class Sounds {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private muted = false;

  private readonly sources: Record<string, string>;

  constructor(sources: Record<string, string>) {
    this.sources = { ...sources };
  }

  /** Call from the first touch handler. */
  unlock(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    void this.ctx.resume();
    this.decode(this.sources);
  }

  /** Sounds that arrive later (a loading phase's `sounds`); decoded now if audio is unlocked. */
  add(sources: Record<string, string>): void {
    Object.assign(this.sources, sources);
    if (this.ctx) this.decode(sources);
  }

  private decode(sources: Record<string, string>): void {
    for (const [name, url] of Object.entries(sources)) {
      const bytes = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));
      this.ctx!.decodeAudioData(bytes.buffer).then(
        (b) => this.buffers.set(name, b),
        () => {},
      );
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx) return;
    void (muted ? this.ctx.suspend() : this.ctx.resume());
  }

  play(name: string, opts: { volume?: number; rate?: number } = {}): void {
    const buf = this.buffers.get(name);
    if (!this.ctx || !buf || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }
}
