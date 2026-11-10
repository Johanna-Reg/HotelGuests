/** Tileable textures painted at load time (no image files): stone walls, plank floors, the rug. */
import { rng, roundRect, shade } from './iso.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Stone blocks; one tile covers 2×2 world units. `grime` darkens and greens it. */
export function stoneTexture(base: string, grime: number, seed: number): HTMLCanvasElement {
  const S = 256;
  const [cv, c] = canvas(S, S);
  const r = rng(seed);
  c.fillStyle = shade(base, -0.45);
  c.fillRect(0, 0, S, S);
  const rows = 6;
  const rh = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -rh * 0.6 : 0;
    while (x < S) {
      const w = rh * (1.2 + r() * 0.9);
      const k = (r() - 0.5) * 0.2 - grime * r() * 0.22;
      const draw = (ox: number) => {
        c.fillStyle = shade(base, k);
        roundRect(c, x + ox + 3, row * rh + 3, Math.min(w, S - x + rh) - 6, rh - 6, 9);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fillRect(x + ox + 8, row * rh + 5, w - 18, 4);
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(x + ox + 8, row * rh + rh - 9, w - 18, 4);
      };
      draw(0);
      if (x + w > S) draw(-S);
      if (x < 0) draw(S);
      x += w;
    }
  }
  if (grime > 0) {
    for (let k = 0; k < 6; k++) {
      c.fillStyle = `rgba(60,90,50,${0.12 + r() * 0.12})`;
      c.beginPath();
      c.ellipse(r() * S, r() * S, 20 + r() * 40, 10 + r() * 25, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  return cv;
}

/** Floor planks running along X; one tile covers 2×2 world units. */
export function plankTexture(clean: boolean): HTMLCanvasElement {
  const S = 256;
  const [cv, c] = canvas(S, S);
  const r = rng(clean ? 3 : 4);
  const base = clean ? '#b06f3c' : '#5f4c3e';
  const rows = 5;
  const ph = S / rows;
  for (let row = 0; row < rows; row++) {
    let x = -((row * 97) % 150);
    while (x < S) {
      const len = 110 + r() * 90;
      c.fillStyle = shade(base, (r() - 0.5) * 0.18);
      c.fillRect(x, row * ph, len, ph);
      c.fillStyle = 'rgba(255,230,190,0.10)';
      c.fillRect(x, row * ph, len, 4);
      c.strokeStyle = shade(base, -0.12);
      c.lineWidth = 1.5;
      for (let g = 0; g < 3; g++) {
        const gy = row * ph + 10 + r() * (ph - 20);
        c.beginPath();
        c.moveTo(x + 6, gy);
        c.bezierCurveTo(x + len * 0.3, gy + 3, x + len * 0.6, gy - 3, x + len - 6, gy);
        c.stroke();
      }
      c.fillStyle = shade(base, -0.5);
      c.fillRect(x, row * ph + ph - 3, len, 3);
      c.fillRect(x + len - 3, row * ph, 3, ph);
      x += len;
    }
  }
  if (!clean) {
    for (let k = 0; k < 10; k++) {
      c.fillStyle = `rgba(25,30,25,${0.15 + r() * 0.2})`;
      c.beginPath();
      c.ellipse(r() * S, r() * S, 12 + r() * 30, 8 + r() * 18, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  return cv;
}

export function rugTexture(): HTMLCanvasElement {
  const S = 256;
  const [cv, c] = canvas(S, S);
  c.fillStyle = '#7d2445';
  c.fillRect(0, 0, S, S);
  c.strokeStyle = '#e8b85a';
  c.lineWidth = 10;
  c.strokeRect(16, 16, S - 32, S - 32);
  c.fillStyle = '#5b2a7a';
  c.fillRect(34, 34, S - 68, S - 68);
  c.fillStyle = '#e8b85a';
  c.beginPath();
  c.moveTo(S / 2, 60);
  c.lineTo(S - 60, S / 2);
  c.lineTo(S / 2, S - 60);
  c.lineTo(60, S / 2);
  c.closePath();
  c.fill();
  c.fillStyle = '#a8396a';
  c.beginPath();
  c.moveTo(S / 2, 92);
  c.lineTo(S - 92, S / 2);
  c.lineTo(S / 2, S - 92);
  c.lineTo(92, S / 2);
  c.closePath();
  c.fill();
  c.fillStyle = '#e8b85a';
  for (const [x, y] of [[50, 50], [S - 50, 50], [50, S - 50], [S - 50, S - 50]]) {
    c.beginPath();
    c.arc(x!, y!, 8, 0, Math.PI * 2);
    c.fill();
  }
  return cv;
}

/** A window pane: night sky, moon glow when the room is clean. */
export function glassTexture(clean: boolean): HTMLCanvasElement {
  const [cv, c] = canvas(64, 128);
  const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, clean ? '#5f86c9' : '#1f2b44');
  g.addColorStop(1, clean ? '#c4e6ff' : '#3a5072');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 128);
  c.strokeStyle = '#2a2e36';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(32, 0);
  c.lineTo(32, 128);
  c.moveTo(0, 70);
  c.lineTo(64, 70);
  c.stroke();
  if (!clean) {
    c.strokeStyle = 'rgba(220,230,255,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(10, 30);
    c.lineTo(24, 50);
    c.lineTo(16, 80);
    c.stroke();
  }
  return cv;
}
