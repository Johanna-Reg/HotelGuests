/**
 * Inn merge rules: pure functions shared by the game and the "Guests arriving" playable ad.
 * A board is a flat array of cells (row-major); each cell is empty (null) or an item: a chain and
 * a tier. Two equal items merge into the next tier; the top tier of a chain is a room upgrade that
 * leaves the board and transforms the room.
 */

export type Chain = 'clean' | 'bed' | 'wardrobe' | 'light';
export const CHAINS: readonly Chain[] = ['clean', 'bed', 'wardrobe', 'light'];

/** Tiers 1..MAX_TIER; MAX_TIER is the room upgrade. */
export const MAX_TIER = 3;

export interface Item {
  readonly chain: Chain;
  readonly tier: number;
}

export type Board = readonly (Item | null)[];

/** Seconds on the clock once the player first touches the ad. */
export const ROUND_SECONDS = 45;

export const ITEM_NAMES: Record<Chain, readonly string[]> = {
  clean: ['Rag', 'Broom', 'Magic Broom'],
  bed: ['Pillow', 'Blanket', 'Royal Bed'],
  wardrobe: ['Log', 'Planks', 'Wardrobe'],
  light: ['Candle', 'Lantern', 'Crystal Lamp'],
};

const i = (chain: Chain, tier: number): Item => ({ chain, tier });

/**
 * The opening board, one cell per floor spot in the room: per chain two tier-1 items and one
 * tier-2, so each upgrade takes two merges. Pairs start apart so every merge is a real drag.
 */
export function startBoard(): Board {
  return [
    // the 3×3 grid in the middle of the room, back row first
    i('clean', 1), i('bed', 2), i('wardrobe', 1),
    i('bed', 1), null, i('light', 2),
    i('wardrobe', 2), i('clean', 1), i('light', 1),
    // left of the room, then the front row
    i('light', 1), i('clean', 2),
    i('bed', 1), i('wardrobe', 1), null,
  ];
}

export const same = (a: Item | null, b: Item | null): boolean =>
  a !== null && b !== null && a.chain === b.chain && a.tier === b.tier;

export interface MoveResult {
  board: Board;
  kind: 'merge' | 'move';
  /** The merged item (merge only). */
  made?: Item;
  /** Set when the merge reached MAX_TIER: the item left the board as a room upgrade. */
  upgrade?: Chain;
}

/**
 * Drops the item in `from` on `to`: merges equal items, moves onto an empty cell, otherwise
 * returns null (the item goes back).
 */
export function drop(board: Board, from: number, to: number): MoveResult | null {
  if (from === to) return null;
  const a = board[from] ?? null;
  const b = board[to] ?? null;
  if (!a) return null;
  const next = board.slice();
  if (b === null) {
    next[to] = a;
    next[from] = null;
    return { board: next, kind: 'move' };
  }
  if (!same(a, b) || a.tier >= MAX_TIER) return null;
  const made = i(a.chain, a.tier + 1);
  next[from] = null;
  if (made.tier >= MAX_TIER) {
    next[to] = null;
    return { board: next, kind: 'merge', made, upgrade: made.chain };
  }
  next[to] = made;
  return { board: next, kind: 'merge', made };
}

/** A pair of cells that merge, preferring the lowest chain order (for the hint hand). */
export function hintPair(board: Board): [number, number] | null {
  for (let a = 0; a < board.length; a++) {
    for (let b = a + 1; b < board.length; b++) {
      if (same(board[a] ?? null, board[b] ?? null)) return [a, b];
    }
  }
  return null;
}

export const upgradesDone = (done: ReadonlySet<Chain>): number => CHAINS.filter((c) => done.has(c)).length;
export const roomReady = (done: ReadonlySet<Chain>): boolean => upgradesDone(done) === CHAINS.length;
