/**
 * The ad's lifecycle as window events (`playable:start`, `playable:first-touch`,
 * `playable:end-card`, `playable:cta`, a story video's `playable:cue` and `playable:choice`; the
 * phase loader adds `playable:phase`), so a support
 * package can measure an ad (time to first touch, end card reached, CTA taps) without changing
 * its code. The engine sends nothing anywhere: networks forbid requests from the ad.
 */
export type AdEvent = 'start' | 'first-touch' | 'end-card' | 'cta' | 'cue' | 'choice';

export function adEvent(name: AdEvent, detail: Record<string, unknown> = {}): void {
  if (typeof CustomEvent === 'function') dispatchEvent(new CustomEvent(`playable:${name}`, { detail: { ...detail, ms: Math.round(performance.now()) } }));
}
