/**
 * Tiny synthesised sound effects (no audio files: nothing to download). Silent until the first
 * touch, as every network requires, and suspended while the ad is hidden.
 */
export function createSfx() {
  let ctx: AudioContext | null = null;
  const tone = (freq: number, at: number, len: number, type: OscillatorType = 'sine', vol = 0.18) => {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + len + 0.02);
  };
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    void (document.hidden ? ctx.suspend() : ctx.resume());
  });
  return {
    unlock() {
      if (ctx) return;
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      void ctx.resume();
    },
    pick: () => tone(660, 0, 0.08, 'triangle', 0.12),
    drop: () => tone(330, 0, 0.1, 'triangle', 0.1),
    nope: () => {
      tone(220, 0, 0.12, 'square', 0.05);
      tone(180, 0.08, 0.14, 'square', 0.05);
    },
    merge: (tier: number) => {
      const base = 520 + tier * 120;
      tone(base, 0, 0.18, 'sine', 0.2);
      tone(base * 1.5, 0.07, 0.22, 'sine', 0.16);
    },
    upgrade: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.35, 'triangle', 0.16)),
    tick: () => tone(1200, 0, 0.05, 'square', 0.04),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.11, 0.5, 'triangle', 0.18)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.4, 'sawtooth', 0.06)),
  };
}
