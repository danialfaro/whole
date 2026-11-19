/*
 * The single mutable game state, shared by every module.
 *
 * Delayed callbacks (setTimeout / rAF) must check that the run they belong to
 * is still current (S.mode, S.round, S.over) before acting: the player can quit
 * or restart in the middle of any animation.
 */
import { store } from "./platform/storage.js";

export const S = {
  mode: "classic", // "classic" | "endless" (Stream = endless + stream flag)
  stream: false,
  level: store.get("level", 1), // classic level
  round: 1, // endless round / stream stage
  pieces: [], // board: [{ id, mask }]
  sel: [], // selected piece ids
  score: 0,
  combo: 0,
  hist: [], // undo snapshots
  busy: false, // blocks input during intros and transitions
  over: false, // endless run finished
  levelStart: 0, // score when the classic level started (restart)
  undos: 3, // endless undo budget
  bestStart: 0, // best score when the run started
  // Stream mode
  queue: [],
  cap: 0,
  target: 0,
  done: 0,
  // EXTRA bonus rounds (endless, not stream)
  bonus: false,
  sinceBonus: 0,
  xOn: false, // countdown running
  xTot: 0, // ms
  xLeft: 0, // ms
  xCircles: [], // masks of each circle made, replayed in the finale
};

/** Classic progress: highest unlocked level. */
export const prog = { max: store.get("max", 1) };

export const isEndless = () => S.mode === "endless";
export const isStream = () => S.stream && S.mode === "endless";
