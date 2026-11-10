import { adEvent } from './events.ts';

/**
 * MRAID 2/3 lifecycle with a plain-browser fallback: the ad starts once the container is ready
 * and the ad is on screen, and pauses (audio, timers) while it is hidden.
 */
interface Mraid {
  getState(): string;
  isViewable(): boolean;
  addEventListener(event: string, fn: (...args: unknown[]) => void): void;
  open(url: string): void;
}

export function mraid(): Mraid | null {
  return (globalThis as { mraid?: Mraid }).mraid ?? null;
}

/** Calls `start` once, when the ad may run; `onVisible(false)` while it is hidden. */
export function whenReady(start: () => void, onVisible: (visible: boolean) => void = () => {}): void {
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    adEvent('start');
    addEventListener('pointerdown', () => adEvent('first-touch'), { once: true, capture: true });
    start();
  };
  const m = mraid();
  if (!m) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
    else go();
    document.addEventListener('visibilitychange', () => onVisible(!document.hidden));
    return;
  }
  const viewable = () => {
    if (m.isViewable()) go();
    m.addEventListener('viewableChange', (v) => {
      onVisible(!!v);
      if (v) go();
    });
  };
  if (m.getState() === 'loading') m.addEventListener('ready', viewable);
  else viewable();
}
