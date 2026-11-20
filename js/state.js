/*
 * The single mutable game state, shared by every module.
 *
 * Delayed callbacks (setTimeout / rAF) must check that the run they belong to
 * is still current (S.mode, S.round, S.over) before acting: the player can quit
 * or restart in the middle of any animation.
 */
import { store } from "./platform/storage.js";

export const S = {
  mode: "classic", // "classic" | "endless"
  level: store.get("level", 1), // classic level
  round: 1, // endless round
  pieces: [], // board: [{ id, mask }]
  sel: [], // selected piece ids
  score: 0,
  combo: 0,
  hist: [], // undo snapshots
  busy: false, // blocks input during intros and transitions
  dead: false, // dead end: the board can't be cleared any more, only Undo / Restart
  over: false, // endless run finished
  levelStart: 0, // score when the classic level started (restart)
  // Classic stars: a level is worth ★ + ★ without hints + ★ without undo
  usedHint: false,
  usedUndo: false,
  // Endless
  undos: 3, // undo budget
  bestStart: 0, // best score when the run started
  // round clock (endless, see modes/clock.js)
  clockOn: false, // counting down
  clockTotal: 0, // ms
  clockLeft: 0, // ms
  // EXTRA bonus rounds (endless)
  bonus: false,
  charge: 0, // EXTRA meter, 0..CHARGE_MAX (modes/charge.js); full = next round is EXTRA
  chargeGrace: 0, // performance.now() until which the meter does not drain
  xCircles: [], // masks of each circle made, replayed in the finale
};

/** Classic progress: highest unlocked level, best stars per level, hints in stock. */
export const prog = {
  max: store.get("max", 1),
  stars: store.get("stars", {}), // { [level]: 1..3 }
  hints: store.get("hints", 3),
};

export const isEndless = () => S.mode === "endless";
