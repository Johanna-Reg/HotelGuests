import type { Stage } from './stage.ts';

export type Dir4 = 'right' | 'up' | 'left' | 'down';

export interface InputHandlers {
  /** Any first touch (unlock audio, start timers). */
  onFirst?: () => void;
  onTap?: (x: number, y: number) => void;
  /** A drag past `threshold` design units, reported once per touch. */
  onSwipe?: (x: number, y: number, dir: Dir4) => void;
}

/** Pointer input in design units: taps and four-way swipes. */
export function listen(stage: Stage, h: InputHandlers, threshold = 60): void {
  let start: [number, number] | null = null;
  let first = true;
  const el = stage.canvas;
  el.addEventListener('pointerdown', (e) => {
    if (first) {
      first = false;
      h.onFirst?.();
    }
    start = stage.toDesign(e.clientX, e.clientY);
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const [x, y] = stage.toDesign(e.clientX, e.clientY);
    const dx = x - start[0];
    const dy = y - start[1];
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    const dir: Dir4 = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    h.onSwipe?.(start[0], start[1], dir);
    start = null;
  });
  el.addEventListener('pointerup', (e) => {
    if (start) h.onTap?.(...stage.toDesign(e.clientX, e.clientY));
    start = null;
  });
  el.addEventListener('pointercancel', () => (start = null));
}
