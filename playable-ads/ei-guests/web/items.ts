/** Merge item icons, drawn in vector and cached per item at the stage's pixel density. */
import type { Chain, Item } from '../../../src/inn/merge-rules.ts';
import { roundRect } from './iso.ts';

type Ctx = CanvasRenderingContext2D;
export const ICON = 150;

function outline(c: Ctx, fill: string, line = '#3b2412', lw = 5) {
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = line;
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.stroke();
}

function sparkle(c: Ctx, x: number, y: number, r: number, color = '#fff6c4') {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
  c.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
  c.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
  c.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
  c.fill();
}

function glow(c: Ctx, color: string, r = 70) {
  const g = c.createRadialGradient(0, 0, 4, 0, 0, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
}

const draw: Record<Chain, ((c: Ctx) => void)[]> = {
  clean: [
    (c) => {
      // Rag.
      c.beginPath();
      c.moveTo(-46, -10);
      c.quadraticCurveTo(-30, -44, 4, -34);
      c.quadraticCurveTo(40, -40, 48, -6);
      c.quadraticCurveTo(54, 30, 18, 38);
      c.quadraticCurveTo(-20, 48, -40, 26);
      c.quadraticCurveTo(-56, 10, -46, -10);
      outline(c, '#5aa6d6', '#1f4f72');
      c.strokeStyle = '#3a82b5';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-26, -8);
      c.quadraticCurveTo(0, 6, 26, -12);
      c.moveTo(-20, 18);
      c.quadraticCurveTo(4, 26, 30, 14);
      c.stroke();
    },
    (c) => {
      // Broom.
      c.save();
      c.rotate(-0.6);
      roundRect(c, -6, -64, 12, 78, 5);
      outline(c, '#b5753d');
      c.beginPath();
      c.moveTo(-22, 10);
      c.lineTo(22, 10);
      c.lineTo(34, 56);
      c.lineTo(-34, 56);
      c.closePath();
      outline(c, '#f0c45a', '#7a5a14');
      roundRect(c, -24, 6, 48, 12, 4);
      outline(c, '#c9473b', '#5a1a14', 4);
      c.strokeStyle = '#c99a2e';
      c.lineWidth = 3;
      for (let k = -2; k <= 2; k++) {
        c.beginPath();
        c.moveTo(k * 8, 22);
        c.lineTo(k * 12, 52);
        c.stroke();
      }
      c.restore();
    },
    (c) => {
      glow(c, 'rgba(140,220,255,0.75)');
      draw.clean[1]!(c);
      sparkle(c, 36, -36, 16);
      sparkle(c, -40, 30, 11, '#b8f0ff');
      sparkle(c, 42, 30, 9);
    },
  ],
  bed: [
    (c) => {
      // Pillow.
      c.beginPath();
      c.moveTo(-50, -26);
      c.quadraticCurveTo(0, -40, 50, -26);
      c.quadraticCurveTo(60, 0, 50, 26);
      c.quadraticCurveTo(0, 40, -50, 26);
      c.quadraticCurveTo(-60, 0, -50, -26);
      outline(c, '#fbf6ea', '#8f8570');
      c.strokeStyle = '#d9cfba';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-30, -6);
      c.quadraticCurveTo(0, 6, 30, -6);
      c.stroke();
    },
    (c) => {
      // Folded blanket.
      for (const [y, col] of [[18, '#6f3f98'], [-2, '#8a55b8'], [-22, '#a06ccc']] as [number, string][]) {
        roundRect(c, -52, y - 14, 104, 30, 10);
        outline(c, col, '#3d1d5c');
      }
      c.strokeStyle = '#f0c35c';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-44, -22);
      c.lineTo(44, -22);
      c.stroke();
    },
    (c) => {
      glow(c, 'rgba(210,160,255,0.7)');
      roundRect(c, -54, -46, 30, 70, 8);
      outline(c, '#b5703a');
      roundRect(c, -54, -4, 108, 34, 8);
      outline(c, '#b5703a');
      roundRect(c, -50, -16, 100, 22, 8);
      outline(c, '#f4ecd6', '#8f8570');
      roundRect(c, -14, -18, 64, 30, 10);
      outline(c, '#9a63c4', '#3d1d5c');
      roundRect(c, -46, -30, 30, 18, 8);
      outline(c, '#fffaf0', '#8f8570', 4);
      sparkle(c, 40, -40, 14);
    },
  ],
  wardrobe: [
    (c) => {
      // Log.
      c.save();
      c.rotate(-0.3);
      roundRect(c, -52, -22, 96, 44, 20);
      outline(c, '#8b5a32');
      c.beginPath();
      c.ellipse(44, 0, 14, 22, 0, 0, Math.PI * 2);
      outline(c, '#e2b47a');
      c.strokeStyle = '#a77845';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(44, 0, 6, 11, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    },
    (c) => {
      // Planks.
      for (const [y, r] of [[22, 0.05], [0, -0.05], [-22, 0.04]] as [number, number][]) {
        c.save();
        c.translate(0, y);
        c.rotate(r);
        roundRect(c, -56, -10, 112, 20, 4);
        outline(c, '#c88a52');
        c.fillStyle = '#5a3418';
        c.beginPath();
        c.arc(-44, 0, 3, 0, Math.PI * 2);
        c.arc(44, 0, 3, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    },
    (c) => {
      glow(c, 'rgba(255,210,140,0.6)');
      roundRect(c, -40, -56, 80, 108, 6);
      outline(c, '#6a3a20', '#2a140a');
      roundRect(c, -46, -62, 92, 12, 4);
      outline(c, '#8a4f2c', '#2a140a', 4);
      c.strokeStyle = '#a0623a';
      c.lineWidth = 4;
      roundRect(c, -32, -44, 28, 86, 4);
      c.stroke();
      roundRect(c, 4, -44, 28, 86, 4);
      c.stroke();
      c.fillStyle = '#f0c35c';
      c.beginPath();
      c.arc(-8, 0, 4, 0, Math.PI * 2);
      c.arc(8, 0, 4, 0, Math.PI * 2);
      c.fill();
      sparkle(c, 44, -44, 13);
    },
  ],
  light: [
    (c) => {
      // Candle.
      glow(c, 'rgba(255,200,90,0.45)', 50);
      roundRect(c, -16, -18, 32, 62, 6);
      outline(c, '#f4ecd6', '#8f8570');
      c.beginPath();
      c.moveTo(0, -50);
      c.quadraticCurveTo(14, -30, 0, -22);
      c.quadraticCurveTo(-14, -30, 0, -50);
      outline(c, '#ffb43a', '#b85a10', 3);
    },
    (c) => {
      // Lantern.
      glow(c, 'rgba(255,200,90,0.55)', 60);
      c.beginPath();
      c.arc(0, -50, 10, Math.PI, 0);
      c.strokeStyle = '#3a2a1c';
      c.lineWidth = 5;
      c.stroke();
      roundRect(c, -30, -42, 60, 12, 4);
      outline(c, '#4a3524');
      roundRect(c, -24, -30, 48, 62, 6);
      outline(c, '#ffe39a', '#3a2a1c');
      roundRect(c, -32, 30, 64, 14, 4);
      outline(c, '#4a3524');
      c.beginPath();
      c.moveTo(0, -14);
      c.quadraticCurveTo(12, 4, 0, 16);
      c.quadraticCurveTo(-12, 4, 0, -14);
      c.fillStyle = '#ff9a2a';
      c.fill();
    },
    (c) => {
      // Crystal lamp.
      glow(c, 'rgba(150,230,255,0.85)', 76);
      c.beginPath();
      c.moveTo(0, -56);
      c.lineTo(26, -14);
      c.lineTo(12, 22);
      c.lineTo(-12, 22);
      c.lineTo(-26, -14);
      c.closePath();
      outline(c, '#8fe6ff', '#1f5f80');
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.beginPath();
      c.moveTo(0, -50);
      c.lineTo(10, -14);
      c.lineTo(0, 16);
      c.closePath();
      c.fill();
      roundRect(c, -28, 22, 56, 14, 5);
      outline(c, '#e9b44c', '#7a5414');
      roundRect(c, -18, 36, 36, 14, 5);
      outline(c, '#c98f2e', '#7a5414');
      sparkle(c, 36, -40, 14);
      sparkle(c, -38, -20, 10, '#d8f6ff');
    },
  ],
};

const cache = new Map<string, HTMLCanvasElement>();

/** The icon canvas for an item (ICON design units square). */
export function itemIcon(item: Item, k: number): HTMLCanvasElement {
  const key = `${item.chain}:${item.tier}`;
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(ICON * k);
  const c = cv.getContext('2d')!;
  c.scale(k, k);
  c.translate(ICON / 2, ICON / 2);
  c.lineCap = 'round';
  draw[item.chain][item.tier - 1]!(c);
  cache.set(key, cv);
  return cv;
}
