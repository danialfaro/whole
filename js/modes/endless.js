/*
 * Endless runs: a fresh random board each round until no circle can be made.
 * Stream is a variant (S.stream): a fixed-size board refilled from a visible queue.
 * Endless (not Stream) occasionally turns a round into a timed EXTRA round (extra.js).
 */
import { S, isEndless } from "../state.js";
import { store } from "../platform/storage.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { anyCircle, solveAll } from "../core/geometry.js";
import { genLevel, streamSequence } from "../core/generate.js";
import { $, show, ov } from "../ui/dom.js";
import { PAL, RB } from "../ui/shapes.js";
import { mkCell, render, renderQueue } from "../ui/board.js";
import { burstCenter } from "../ui/fx.js";
import { endExtra, extraFinale, startExtra } from "./extra.js";

/** At least BONUS_MIN normal rounds between EXTRA rounds; one is forced after BONUS_MAX. */
const BONUS_MIN = 4,
  BONUS_MAX = 8;

/* ---------- best scores ---------- */

const bestKey = () => (S.stream ? "bestS" : "best");

/** Show the best scores on the menu buttons. */
export function bestLabel() {
  const best = store.get("best", 0),
    bestStream = store.get("bestS", 0);
  $("endless").textContent = best ? "Endless · Best " + best.toLocaleString() : "Endless";
  $("stream").textContent = bestStream ? "Stream · Best " + bestStream.toLocaleString() : "Stream";
}

export function saveBest() {
  if (isEndless() && S.score > store.get(bestKey(), 0)) store.set(bestKey(), S.score);
}

/* ---------- run flow ---------- */

/** Start a run. `stream` undefined = same variant as the last run (Play again / Restart). */
export function startEndless(stream) {
  if (stream !== undefined) S.stream = !!stream;
  S.mode = "endless";
  S.xOn = false;
  S.round = 0;
  S.score = 0;
  S.undos = 3;
  S.sinceBonus = 0;
  S.bestStart = store.get(bestKey(), 0);
  $("pLvls").style.display = "none";
  $("restart").textContent = "Restart run";
  ov("ovWin", false);
  ov("ovOver", false);
  show("game");
  nextRound(true);
}

export function nextRound(first) {
  S.round++;
  const gap = S.sinceBonus;
  S.bonus = !S.stream && !first && S.round >= 3 && gap >= BONUS_MIN && (gap >= BONUS_MAX || Math.random() < 0.4);
  S.sinceBonus = S.bonus ? 0 : gap + 1;
  if (S.stream) setupStream();
  else {
    // EXTRA rounds use a smaller board: it has to be cleared against the clock
    const difficulty = S.bonus ? Math.min(3 + Math.floor(S.round / 6), 6) : Math.min(S.round + 1, 14);
    S.pieces = genLevel(difficulty, 0, (Math.random() * 1e6) | 0);
  }
  S.sel = [];
  S.combo = 0;
  S.hist = [];
  S.busy = false;
  S.over = false;
  S.xOn = false;
  $("board").classList.remove("dim");
  render(true);
  if (S.bonus) startExtra();
}

/** Board cleared in endless/stream. */
export function winEndless() {
  if (S.bonus && S.xOn) {
    extraFinale();
    return;
  }
  S.xOn = false;
  S.score += 40 * S.round * (S.bonus ? 3 : 1);
  saveBest();
  Hap.v([10, 40, 10, 40, 24]);
  Snd.level();
  if (S.bonus) Snd.fanfare(true);
  Snd.finale(S.combo - 1, S.bonus ? 1 : 0.55);
  render(false);
  burstCenter(18, S.bonus ? RB : PAL);
  setTimeout(() => $("prev").classList.add("gone"), 550);
  setTimeout(() => {
    if (!S.pieces.length && isEndless() && !S.over) nextRound();
  }, 1150);
}

/** End the run when nothing can be completed and no undo is left. */
export function checkOver() {
  if (!isEndless() || S.over || !S.pieces.length) return;
  const playable = S.stream ? anyCircle(S.pieces) : solveAll(S.pieces);
  if (playable || (S.hist.length && S.undos > 0)) return;
  if (S.bonus) {
    endExtra("No circles left");
    return;
  }
  S.over = true;
  S.busy = true;
  saveBest();
  const newBest = S.score > S.bestStart;
  $("os").textContent = S.score.toLocaleString();
  $("ob").textContent = newBest ? "New best score" : "Best: " + Math.max(S.bestStart, S.score).toLocaleString();
  setTimeout(() => {
    if (S.over) {
      Snd.invalid();
      ov("ovOver", true);
    }
  }, 800);
}

/* ---------- stream ---------- */

function setupStream() {
  const { target, cap, pieces } = streamSequence(S.round);
  S.target = target;
  S.cap = cap;
  S.done = 0;
  S.pieces = pieces.slice(0, cap);
  S.queue = pieces.slice(cap);
}

/** After a circle in Stream: top the board back up from the queue. */
export function refill() {
  const b = $("board"),
    added = [];
  while (S.pieces.length < S.cap && S.queue.length) {
    const p = S.queue.shift();
    S.pieces.push(p);
    added.push(p);
  }
  S.done++;
  added.forEach((p, i) => b.appendChild(mkCell(p, i * 70 + 260)));
  renderQueue();
}
