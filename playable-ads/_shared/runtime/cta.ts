import './network.ts';
import { adEvent } from './events.ts';
import { mraid } from './mraid.ts';

type Fn = () => void;
const g = globalThis as {
  FbPlayableAd?: { onCTAClick: Fn };
  ExitApi?: { exit: Fn };
  install?: Fn;
  gameEnd?: Fn;
  openAppStore?: Fn;
};

/** Opens the store through the network's own call; each network rejects ads that link out any other way. */
export function openStore(url: string): void {
  adEvent('cta');
  if (__PLAYABLE_NETWORK__ === 'meta') g.FbPlayableAd?.onCTAClick();
  else if (__PLAYABLE_NETWORK__ === 'google') g.ExitApi?.exit();
  else if (__PLAYABLE_NETWORK__ === 'mintegral') g.install?.();
  else if (__PLAYABLE_NETWORK__ === 'tiktok') g.openAppStore?.();
  else {
    const m = mraid();
    if (m) m.open(url);
    else window.open(url, '_blank');
  }
}

/** The store page for this device (MRAID and browser fallbacks open it directly). */
export function storeUrlFor(urls: { ios: string; android: string }): string {
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? urls.ios : urls.android;
}

/** The interactive part is over (Mintegral's review checks for this call). */
export function gameEnded(): void {
  if (__PLAYABLE_NETWORK__ === 'mintegral') g.gameEnd?.();
}
