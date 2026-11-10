import { gameEnded, openStore } from './cta.ts';
import { adEvent } from './events.ts';

export interface EndCardOptions {
  title: string;
  button: string;
  storeUrl: string;
  /** A data URL shown above the title (the game's icon or logo). */
  image?: string;
}

/**
 * The end card: DOM over the canvas, so the CTA stays sharp and tappable at any size.
 * `data-playable-cta` marks the button; `gameengine playable validate` requires it.
 */
export function showEndCard(o: EndCardOptions): HTMLElement {
  gameEnded();
  adEvent('end-card');
  const card = document.createElement('div');
  card.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:rgba(10,6,24,.82);font-family:system-ui,sans-serif;color:#fff;text-align:center;opacity:0;transition:opacity .35s';
  if (o.image) {
    const img = document.createElement('img');
    img.src = o.image;
    img.style.cssText = 'width:30vmin;height:30vmin;object-fit:contain';
    card.appendChild(img);
  }
  const title = document.createElement('div');
  title.textContent = o.title;
  title.style.cssText = 'font-size:7vmin;font-weight:800;padding:0 8vmin';
  const button = document.createElement('button');
  button.textContent = o.button;
  button.setAttribute('data-playable-cta', '');
  button.style.cssText =
    'font:800 6vmin system-ui,sans-serif;color:#1b0f3a;background:linear-gradient(#ffe56b,#ffb300);border:0;border-radius:6vmin;padding:3vmin 12vmin;box-shadow:0 1vmin 0 #b36b00;animation:playable-pulse 1s ease-in-out infinite alternate';
  button.addEventListener('click', () => openStore(o.storeUrl));
  const style = document.createElement('style');
  style.textContent = '@keyframes playable-pulse{to{transform:scale(1.08)}}';
  card.append(style, title, button);
  document.body.appendChild(card);
  requestAnimationFrame(() => (card.style.opacity = '1'));
  return card;
}
