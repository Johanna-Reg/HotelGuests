/** The engine's ease names (sim `tween()`), so tuning copies over from the slice unchanged. */
export const EASES = {
  linear: (t: number) => t,
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outBounce: (t: number) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
export type Ease = keyof typeof EASES;

interface Running {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  delay: number;
  t: number;
  ease: Ease;
  done?: () => void;
}

/** Numeric property tweens, advanced by `update(dt)` from the stage loop. */
export class Tweens {
  private list: Running[] = [];

  to<T extends object>(
    target: T,
    to: Partial<Record<keyof T, number>>,
    duration: number,
    ease: Ease = 'linear',
    opts: { delay?: number; done?: () => void } = {},
  ): void {
    const t = target as unknown as Record<string, number>;
    const dest = to as Record<string, number>;
    // A new tween on the same property replaces the old one.
    this.list = this.list.filter((r) => r.target !== t || !Object.keys(dest).some((k) => k in r.to));
    const from: Record<string, number> = {};
    for (const k of Object.keys(dest)) from[k] = t[k]!;
    this.list.push({ target: t, from, to: dest, duration: Math.max(duration, 1e-4), delay: opts.delay ?? 0, t: 0, ease, done: opts.done });
  }

  get busy(): boolean {
    return this.list.length > 0;
  }

  update(dt: number): void {
    const finished: Running[] = [];
    for (const r of this.list) {
      if (r.delay > 0) {
        r.delay -= dt;
        continue;
      }
      r.t = Math.min(r.t + dt / r.duration, 1);
      const k = EASES[r.ease](r.t);
      for (const p of Object.keys(r.to)) r.target[p] = r.from[p]! + (r.to[p]! - r.from[p]!) * k;
      if (r.t >= 1) finished.push(r);
    }
    if (finished.length === 0) return;
    this.list = this.list.filter((r) => !finished.includes(r));
    for (const r of finished) r.done?.();
  }
}
