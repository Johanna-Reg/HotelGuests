import { worldTest, expect } from '@gameengine/test';
import { CHAINS, MAX_TIER, drop, hintPair, roomReady, startBoard, type Board, type Chain } from '../src/inn/merge-rules.ts';

worldTest('two equal items merge into the next tier', async () => {
  const r = drop(startBoard(), 3, 11)!; // bed 1 + bed 1
  expect(r.kind).toBe('merge');
  expect(r.board[11]?.tier).toBe(2);
  expect(r.board[3]).toBe(null);
});

worldTest('different items do not merge', async () => {
  expect(drop(startBoard(), 0, 1)).toBe(null);
});

worldTest('an item moves onto an empty cell', async () => {
  const r = drop(startBoard(), 0, 4)!;
  expect(r.kind).toBe('move');
  expect(r.board[4]?.chain).toBe('clean');
});

worldTest('the starting board finishes every upgrade by following hints', async () => {
  let board: Board = startBoard();
  const done = new Set<Chain>();
  for (let moves = 0; moves < 20 && !roomReady(done); moves++) {
    const pair = hintPair(board);
    expect(pair === null).toBe(false);
    const r = drop(board, pair![0], pair![1])!;
    if (r.upgrade) done.add(r.upgrade);
    board = r.board;
  }
  expect(done.size).toBe(CHAINS.length);
  expect(board.every((c) => c === null)).toBe(true);
});

worldTest('the top tier leaves the board as an upgrade', async () => {
  const board: Board = [{ chain: 'light', tier: MAX_TIER - 1 }, { chain: 'light', tier: MAX_TIER - 1 }];
  const r = drop(board, 0, 1)!;
  expect(r.upgrade).toBe('light');
  expect(r.board[1]).toBe(null);
});
