/*
 * Board generation. Pure: no DOM, no game state.
 *
 * Boards are built by cutting whole circles into the partitions of a difficulty
 * tier, so they are always solvable. Classic levels are deterministic: the same
 * level number always gives the same board. Changing the order or number of
 * rng() calls changes every classic level.
 */
import { N, arcMask, solveAll } from "./geometry.js";

/** Seeded PRNG (mulberry32): returns a function giving floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ways to cut one circle (arc lengths in sectors), per difficulty tier. */
export const TIERS = [
  [[4, 4]],
  [
    [4, 4],
    [2, 2, 4],
    [2, 2, 2, 2],
  ],
  [
    [2, 2, 4],
    [6, 2],
    [2, 2, 2, 2],
    [4, 4],
  ],
  [
    [3, 3, 2],
    [6, 2],
    [4, 2, 2],
    [2, 2, 2, 2],
    [3, 5],
  ],
  [
    [3, 3, 2],
    [4, 3, 1],
    [1, 1, 2, 4],
    [3, 3, 1, 1],
    [2, 2, 2, 1, 1],
  ],
];

const MAX_CIRCLES = 7;
const MAX_PIECES = 26;

export const tierOf = (n) => Math.min(Math.floor((n - 1) / 2), TIERS.length - 1);

function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Starting sector for a cut. Even-only cuts in early tiers start on an even
 * sector so pieces line up with quarter/half positions. `roll` = false skips
 * the first random draw (level 1).
 */
function pickStart(r, part, tier, roll = true) {
  const s = roll ? Math.floor(r() * N) : 0;
  const odd = part.some((x) => x % 2);
  return !odd && tier < 3 ? Math.floor(r() * 4) * 2 : s;
}

/** Cut one circle into arcs of the given lengths (shuffled), starting at `start`. */
function cutCircle(r, part, start) {
  let s = start;
  return shuffle(part.slice(), r).map((len) => {
    const m = arcMask(s, len);
    s = (s + len) % N;
    return m;
  });
}

/** Board for level `n`. `base` reseeds it (Endless mode); `salt` is the retry counter. */
export function genLevel(n, salt = 0, base = 0) {
  const r = rng(n * 7919 + 13 + salt * 101 + base),
    tier = tierOf(n),
    pool = TIERS[tier];
  const circlesN = Math.min(2 + Math.floor((n - 1) / 2), MAX_CIRCLES);
  const out = [];
  let id = 1;
  for (let c = 0; c < circlesN; c++) {
    const part = n === 1 ? [4, 4] : pool[Math.floor(r() * pool.length)];
    if (out.length + part.length > MAX_PIECES) break;
    const start = pickStart(r, part, tier, n !== 1);
    for (const mask of cutCircle(r, part, start)) out.push({ id: id++, mask });
  }
  shuffle(out, r);
  return solveAll(out) || salt > 20 ? out : genLevel(n, salt + 1, base);
}

/**
 * Stream mode round: an ordered sequence of pieces that make `target` circles.
 * Pieces of one circle stay roughly together in the sequence (jittered keys)
 * so the visible board can always progress. Not seeded.
 */
export function streamSequence(round) {
  const r = rng((Math.random() * 1e9) | 0),
    tier = tierOf(round),
    pool = TIERS[tier];
  const target = Math.min(5 + Math.floor(round / 2), 9);
  const cap = round >= 7 ? 10 : round >= 3 ? 9 : 8;
  const seq = [];
  for (let c = 0; c < target; c++) {
    const part = pool[Math.floor(r() * pool.length)];
    for (const mask of cutCircle(r, part, pickStart(r, part, tier))) {
      seq.push({ mask, key: seq.length + r() * 3.5 });
    }
  }
  seq.sort((a, b) => a.key - b.key);
  const pieces = seq.map((x, i) => ({ id: i + 1, mask: x.mask }));
  return { target, cap, pieces };
}
