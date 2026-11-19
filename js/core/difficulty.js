/*
 * How hard is a board? Pure: no DOM, no game state.
 *
 * The measure is the "stuck rate": the share of random playthroughs (pick any
 * possible circle, repeat) that end with pieces left over that can no longer
 * make a circle. 0 means every move is safe and the board needs no thought;
 * higher values mean more of the obvious-looking circles are traps.
 */
import { circles } from "./geometry.js";
import { rng } from "./rng.js";

/** Every circle that can be made right now, each set of pieces once. */
export function allCircles(pieces) {
  const out = [];
  // a circle is found from its first piece in list order only, so no duplicates
  for (let i = 0; i < pieces.length; i++) {
    for (const ch of circles(pieces.slice(i + 1), pieces[i].mask, [pieces[i]])) out.push(ch);
  }
  return out;
}

/** Share (0..1) of `runs` seeded random playthroughs of `pieces` that get stuck. */
export function stuckRate(pieces, seed, runs = 80) {
  const r = rng(seed);
  let stuck = 0;
  for (let k = 0; k < runs; k++) {
    let board = pieces;
    while (board.length) {
      const options = allCircles(board);
      if (!options.length) {
        stuck++;
        break;
      }
      const used = new Set(options[Math.floor(r() * options.length)].map((p) => p.id));
      board = board.filter((p) => !used.has(p.id));
    }
  }
  return stuck / runs;
}
