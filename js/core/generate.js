/*
 * Board generation. Pure: no DOM, no game state.
 *
 * Every board is built by cutting whole circles into arcs, so it is always
 * solvable. Both generators are seeded: changing the order or number of rng()
 * calls changes the boards.
 *
 * Classic levels follow LEVEL_PLAN: among many candidate boards for a level,
 * the one whose measured difficulty (stuck rate, see difficulty.js) is closest
 * to the level's target wins. The winning salt per level is precomputed in
 * levels.js by `node tools/build-levels.mjs`; levels past that table are
 * searched at runtime with fewer candidates.
 */
import { N, arcMask, solveAll } from "./geometry.js";
import { rng } from "./rng.js";
import { stuckRate } from "./difficulty.js";
import { LEVEL_SALTS } from "./levels.js";

function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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

/* ================= Classic levels ================= */

// Ways to cut one circle (arc lengths, in eighths)
const HALVES = [[4, 4]];
const QUARTERS = [
  [4, 4],
  [2, 2, 4],
];
const EVENS = [
  [2, 2, 4],
  [6, 2],
  [2, 2, 2, 2],
  [4, 4],
];
const ODDS = [
  [3, 5],
  [3, 3, 2],
  [6, 2],
  [2, 2, 4],
];
const ALL = [
  [3, 3, 2],
  [4, 3, 1],
  [1, 1, 2, 4],
  [3, 3, 1, 1],
  [2, 2, 2, 1, 1],
  [3, 5],
  [5, 2, 1],
  [6, 1, 1],
  [2, 2, 4],
];

/**
 * Difficulty curve, by stages. `upTo`: last level of the stage. `aligned`: cuts
 * start on even sectors (pieces line up with halves/quarters, no ambiguity).
 * `target`: stuck rate aimed for, rising from [0] to [1] across the stage.
 * Reachable stuck rates are limited by board size: ~35% with 3 circles, ~60%
 * with 4, ~85% with 5 (measured over hundreds of candidates).
 */
export const LEVEL_PLAN = [
  { upTo: 1, circles: 2, parts: HALVES, aligned: true, maxPieces: 4, target: [0, 0] }, // tutorial
  { upTo: 2, circles: 3, parts: QUARTERS, aligned: true, maxPieces: 7, target: [0, 0] },
  { upTo: 3, circles: 3, parts: EVENS, aligned: true, maxPieces: 9, target: [0.3, 0.3] }, // first trap
  { upTo: 5, circles: 3, parts: ODDS, aligned: false, maxPieces: 9, target: [0.25, 0.35] }, // 3/8 and 5/8
  { upTo: 8, circles: 4, parts: ODDS, aligned: false, maxPieces: 12, target: [0.4, 0.5] },
  { upTo: 12, circles: 4, parts: ALL, aligned: false, maxPieces: 14, target: [0.5, 0.6] }, // 1/8
  { upTo: 20, circles: 5, parts: ALL, aligned: false, maxPieces: 16, target: [0.55, 0.7] },
  { upTo: Infinity, circles: 5, parts: ALL, aligned: false, maxPieces: 16, target: [0.75, 0.75] },
];

export const stageOf = (n) => LEVEL_PLAN.find((s) => n <= s.upTo);

/** Stuck rate aimed for at level `n`. */
export function targetOf(n) {
  const i = LEVEL_PLAN.indexOf(stageOf(n)),
    stage = LEVEL_PLAN[i],
    first = i ? LEVEL_PLAN[i - 1].upTo + 1 : 1,
    [from, to] = stage.target;
  if (stage.upTo === Infinity || stage.upTo === first) return from;
  return from + ((to - from) * (n - first)) / (stage.upTo - first);
}

/** Candidate board number `salt` for level `n`. */
export function buildBoard(n, salt) {
  const stage = stageOf(n),
    r = rng(n * 7919 + 13 + salt * 101),
    out = [];
  let id = 1;
  for (let c = 0; c < stage.circles; c++) {
    const part = stage.parts[Math.floor(r() * stage.parts.length)];
    const start = stage.aligned ? Math.floor(r() * 4) * 2 : Math.floor(r() * N);
    for (const mask of cutCircle(r, part, start)) out.push({ id: id++, mask });
  }
  return shuffle(out, r);
}

// Random playthroughs per candidate. Fewer runs are noisier, and picking the best
// of many noisy scores overrates the winner (measured: ~80 runs → levels ~10
// points easier than their target).
const RATE_RUNS = 200;

/** Measured difficulty of candidate `salt` for level `n` (deterministic). */
export const rateBoard = (n, salt, board = buildBoard(n, salt)) => stuckRate(board, n * 31 + salt, RATE_RUNS);

/**
 * Search `tries` candidates for level `n` and return the best one:
 * closest to the target stuck rate, then fewest pieces, then lowest salt.
 */
export function pickBoard(n, tries) {
  const stage = stageOf(n),
    target = targetOf(n);
  let best = null;
  for (let salt = 0; salt < tries; salt++) {
    const board = buildBoard(n, salt);
    if (board.length > stage.maxPieces) continue;
    const rate = rateBoard(n, salt, board),
      miss = Math.abs(rate - target);
    if (!best || miss < best.miss || (miss === best.miss && board.length < best.pieces))
      best = { salt, rate, miss, pieces: board.length };
    if (miss <= 0.02) break; // close enough: random playthroughs are noisy anyway
  }
  return best;
}

const RUNTIME_TRIES = 40; // levels past the precomputed table (keeps level start fast)

/** Board for classic level `n` (always the same board for the same `n`). */
export function genLevel(n) {
  const salt = LEVEL_SALTS[n - 1] ?? pickBoard(n, RUNTIME_TRIES)?.salt ?? 0;
  return buildBoard(n, salt);
}

/* ================= Endless rounds ================= */

/** Ways to cut one circle, per Endless difficulty tier. */
const TIERS = [
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

const tierOf = (n) => Math.min(Math.floor((n - 1) / 2), TIERS.length - 1);

/**
 * Starting sector for a cut. Even-only cuts in early tiers start on an even
 * sector so pieces line up with quarter/half positions. `roll` = false skips
 * the first random draw (difficulty 1).
 */
function pickStart(r, part, tier, roll = true) {
  const s = roll ? Math.floor(r() * N) : 0;
  const odd = part.some((x) => x % 2);
  return !odd && tier < 3 ? Math.floor(r() * 4) * 2 : s;
}

/** Board for an Endless round of the given difficulty, seeded by `base`. */
export function genEndless(difficulty, base, salt = 0) {
  const n = difficulty,
    r = rng(n * 7919 + 13 + salt * 101 + base),
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
  return solveAll(out) || salt > 20 ? out : genEndless(difficulty, base, salt + 1);
}
