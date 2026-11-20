/*
 * Endless runs: a fresh random board each round, against the clock
 * (modes/clock.js). Clearing a round fast pays a time bonus (counted up in a
 * total that flies to the score, ui/fx.js tally()); running out of
 * time, or getting stuck with no undo left, ends the run.
 * Circles in normal rounds charge the EXTRA meter (charge.js); when it is full
 * the next round is an EXTRA round (extra.js).
 */
import { S, isEndless } from "../state.js";
import { store } from "../platform/storage.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { solveAll } from "../core/geometry.js";
import { genEndless } from "../core/generate.js";
import { $, show, ov } from "../ui/dom.js";
import { PAL } from "../ui/shapes.js";
import { refreshTools, render, status } from "../ui/board.js";
import { scoreHoldLeft, showScore } from "../ui/score.js";
import { burstCenter, tally } from "../ui/fx.js";
import { drainClock, roundTime, setClock, startClock, stopClock } from "./clock.js";
import { endExtra, extraFinale, extraTime, startExtra } from "./extra.js";
import { startMeter, takeExtra } from "./charge.js";

/** Grace before the clock starts on a new board, while its pieces fade in (ms). */
const CLOCK_GRACE = 600;

/* ---------- best score ---------- */

/** Show the best score on the menu button. */
export function bestLabel() {
  const best = store.get("best", 0);
  $("endless").textContent = best ? "Endless · Best " + best.toLocaleString() : "Endless";
}

export function saveBest() {
  if (isEndless() && S.score > store.get("best", 0)) store.set("best", S.score);
}

/* ---------- run flow ---------- */

export function startEndless() {
  S.mode = "endless";
  stopClock();
  S.round = 0;
  S.score = 0;
  S.undos = 3;
  S.charge = 0;
  S.chargeGrace = 0;
  S.bestStart = store.get("best", 0);
  $("pLvls").style.display = "none";
  $("restart").textContent = "Restart run";
  ov("ovWin", false);
  ov("ovOver", false);
  show("game");
  nextRound();
  startMeter();
}

export function nextRound() {
  S.round++;
  S.bonus = takeExtra(); // a full EXTRA meter turns this round into an EXTRA round
  // EXTRA rounds use a smaller board: it has to be cleared against the clock
  const difficulty = S.bonus ? Math.min(3 + Math.floor(S.round / 6), 6) : Math.min(S.round + 1, 14);
  S.pieces = genEndless(difficulty, (Math.random() * 1e6) | 0);
  S.sel = [];
  S.combo = 0;
  S.hist = [];
  S.busy = false;
  S.dead = false;
  S.over = false;
  $("board").classList.remove("dim");
  setClock(S.bonus ? extraTime(S.pieces.length) : roundTime(S.pieces.length, S.round));
  render(true);
  if (S.bonus) {
    startExtra(); // starts the clock after its 3-2-1
    return;
  }
  const round = S.round;
  setTimeout(() => {
    if (S.round === round && isEndless() && !S.over) startClock(timeUp);
  }, CLOCK_GRACE);
}

/**
 * Board cleared in Endless. As the last circle's points fly off, a total
 * in the middle of the board counts the round bonus, then the seconds left
 * drain into it (time bonus), then it flies into the score.
 */
export function winEndless() {
  if (S.bonus) {
    extraFinale();
    return;
  }
  stopClock(); // freeze the time left; it is paid out below
  S.busy = true;
  Hap.v([10, 40, 10, 40, 24]);
  Snd.level();
  Snd.finale(S.combo - 1, 0.55);
  render(false);

  const round = S.round,
    alive = () => isEndless() && !S.over && S.round === round;
  setTimeout(() => {
    if (alive()) burstCenter(22, PAL, { dist: 90, size: 6 }); // once the last circle has locked
  }, 450);
  setTimeout(
    () => {
      if (!alive()) return;
      const t = tally(),
        done = (fn) => () => (alive() ? fn() : t.remove());
      t.label(`Round ${round}`);
      t.add(40 * round, 320);
      Snd.blip(5);
      setTimeout(
        done(() => {
          const { secs, ms } = drainClock((p) => t.add(p));
          if (secs) t.label(`Time left · ${secs} sec`);
          setTimeout(
            done(() => {
              t.fly(() => {
                if (!alive()) return;
                S.score += t.total;
                showScore();
                saveBest();
              });
              setTimeout(() => $("prev").classList.add("gone"), 250);
              setTimeout(() => {
                if (alive() && !S.pieces.length) nextRound();
              }, 720);
            }),
            ms + (secs ? 300 : 150),
          );
        }),
        460,
      );
    },
    Math.max(0, scoreHoldLeft() - 280),
  ); // as the last circle's points leave for the score
}

/** The clock ran out on a normal round: the run is over. */
function timeUp() {
  if (!isEndless() || S.over) return;
  S.sel = [];
  refreshTools();
  $("board").classList.add("dim");
  status("Time's up");
  endRun("time");
}

/** End the run when the board can't be cleared and no undo is left. */
export function checkOver() {
  if (!isEndless() || S.over || !S.pieces.length) return;
  if (solveAll(S.pieces) || (S.hist.length && S.undos > 0)) return;
  if (S.bonus) {
    endExtra("No circles left");
    return;
  }
  endRun("stuck");
}

/** Game over: why ("time" | "stuck"), final score and best. */
function endRun(reason) {
  stopClock();
  S.over = true;
  S.busy = true;
  saveBest();
  const newBest = S.score > S.bestStart;
  $("overTitle").textContent = reason === "time" ? "Time's up" : "Run over";
  $("overWhy").textContent =
    reason === "time" ? `The clock ran out in round ${S.round}.` : "No circle can be completed with what is left.";
  $("os").textContent = S.score.toLocaleString();
  $("ob").textContent = newBest ? "New best score" : "Best: " + Math.max(S.bestStart, S.score).toLocaleString();
  setTimeout(() => {
    if (S.over) {
      Snd.invalid();
      ov("ovOver", true);
    }
  }, 800);
}
