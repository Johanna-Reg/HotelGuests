/**
 * The ad network this build is for. `gameengine playable build` defines `__PLAYABLE_NETWORK__`
 * per network; compare against it directly (not through a variable) so esbuild drops every other
 * network's code and `playable validate` sees only the right calls.
 */
declare global {
  const __PLAYABLE_NETWORK__: Network;
}

export type Network = 'applovin' | 'unity' | 'ironsource' | 'google' | 'meta' | 'mintegral' | 'tiktok' | 'preview';

export const NETWORK: Network = __PLAYABLE_NETWORK__;
