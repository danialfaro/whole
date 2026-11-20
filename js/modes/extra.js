/*
 * EXTRA bonus rounds (Endless only): a rainbow title and a 3-2-1, then clear
 * the board before the round clock runs out (rainbow ring). Each circle adds
 * time and raises the multiplier. Running out of time is not a game over here,
 * just the end of the round. Clearing it plays the finale: a rainbow total in
 * the middle of the board counts up stage by stage (clear, time left, circles
 * made) and then flies into the score as one number.
 */
import { S, isEndless } from "../state.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { $, replay } from "../ui/dom.js";
import { RB } from "../ui/shapes.js";
import { refreshTools, render, status } from "../ui/board.js";
import { renderPreview } from "../ui/preview.js";
import { scoreHoldLeft, showScore } from "../ui/score.js";
import { boardCentre, burst, burstCenter, floatText, tally } from "../ui/fx.js";
import { addTime, drainClock, startClock, stopClock } from "./clock.js";
import { nextRound, saveBest } from "./endless.js";

const TIME_PER_CIRCLE = 2000; // ms added per circle
const CIRCLE_BONUS = 25; // finale: the j-th circle made pays CIRCLE_BONUS * j

/** Time allowed for an EXTRA board (ms): more per piece than a normal round, it is a bonus. */
export const extraTime = (pieces) => Math.round(14 + pieces * 1.8) * 1000;

const rainbowLetters = (text) =>
  [...text].map((c, i) => `<span style="animation-delay:${i * 0.09}s,${i * -0.3}s">${c}</span>`).join("");

/**
 * Run `steps` one after another: each returns how many ms to wait before the
 * next. Stops (and calls `abort`) as soon as `alive()` is false.
 */
function sequence(steps, alive, abort = () => {}) {
  let i = 0;
  const next = () => {
    if (i >= steps.length) return;
    if (!alive()) return abort();
    setTimeout(next, steps[i++]() || 0);
  };
  next();
}

/** Called by nextRound() when the new round is an EXTRA round. */
export function startExtra() {
  $("xtxt").innerHTML = rainbowLetters("EXTRA") + `<em id="xm">×3</em>`;
  extraIntro();
}

/** Rainbow EXTRA title, then a 3-2-1 over the dimmed board, then the clock starts. */
function extraIntro() {
  // the clock was already loaded by nextRound(); it starts after the countdown
  S.busy = true;
  S.xCircles = [];
  renderPreview();

  const cd = document.createElement("div"),
    br = $("board").getBoundingClientRect(),
    wr = $("boardwrap").getBoundingClientRect();
  cd.id = "xcd";
  cd.style.cssText = `left:${br.left - wr.left}px;top:${br.top - wr.top}px;width:${br.width}px;height:${br.height}px`;
  $("boardwrap").appendChild(cd);
  $("board").classList.add("dim");

  const round = S.round,
    alive = () => S.round === round && isEndless() && !S.over;
  status("Chain circles to raise the multiplier");
  sequence(
    [
      () => {
        cd.innerHTML = `<span class="xtitle">${rainbowLetters("EXTRA")}</span>`;
        replay(cd, "slam");
        Snd.fanfare(true);
        Hap.v([6, 30, 6, 30, 14]);
        burstCenter(26, RB, { dist: 120, size: 7 });
        return 900;
      },
      ...[3, 2, 1].map((n, i) => () => {
        cd.textContent = n;
        cd.classList.remove("slam");
        replay(cd, "beat");
        Snd.tick(1500 + i * 350, 0.09, 0.02);
        Hap.v(4);
        return 450;
      }),
      () => {
        cd.remove();
        $("board").classList.remove("dim");
        S.busy = false;
        Hap.v([4, 30, 4]);
        Snd.good(5, 3, true);
        startClock(() => endExtra("Time up"));
        setTimeout(() => {
          if (!S.busy) status();
        }, 2200);
      },
    ],
    alive,
    () => cd.remove(),
  );
}

/**
 * A circle was completed: remember it for the finale, add time, show the new
 * multiplier. The "+2s" and the multiplier pop show up when the circle locks
 * (`lock` ms from now, ui/fx.js).
 */
export function onExtraCircle(chosen, lock = 0) {
  if (!(S.bonus && S.clockOn)) return;
  S.xCircles.push(chosen.map((p) => p.mask));
  addTime(TIME_PER_CIRCLE);
  const mult = "×" + Math.min(3 + S.combo, 10),
    round = S.round;
  setTimeout(() => {
    if (S.round !== round || !S.bonus) return;
    const m = $("xm");
    if (m) {
      m.textContent = mult;
      replay(m, "pop");
    }
    const r = $("prev").querySelector("svg")?.getBoundingClientRect();
    if (r) floatText(r.right + 14, r.top + r.height * 0.3, `+${TIME_PER_CIRCLE / 1000}s`, "rb");
  }, lock);
}

/** Failed (time up or stuck): no game over, just move on to the next round. */
export function endExtra(msg) {
  if (msg !== "Time up" && !S.clockOn) return; // "No circles left" only while the round is live
  stopClock();
  S.busy = true;
  S.sel = [];
  refreshTools();
  $("board").classList.add("dim");
  status(msg);
  Snd.invalid();
  Hap.v([5, 40, 5]);
  setTimeout(() => {
    if (isEndless() && !S.over) nextRound();
  }, 1000);
}

/* ---------- finale ---------- */

const FIRE_NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

/** EXTRA board cleared in time. The finale starts as the last circle's points fly off. */
export function extraFinale() {
  const wait = scoreHoldLeft(),
    round = S.round,
    alive = () => isEndless() && !S.over && S.round === round;
  stopClock();
  S.busy = true;
  render(false);
  setTimeout(
    () => {
      if (alive()) extraFinaleRun(round, alive);
    },
    Math.max(0, wait - 280),
  ); // as the last circle's points leave for the score
}

/**
 * The rainbow total: clear bonus, then the time left drains into it, then each
 * circle made adds a rising bonus; the total flies to the score and the next
 * round starts.
 */
function extraFinaleRun(round, alive) {
  const made = S.xCircles.length,
    t = tally({ rainbow: true });
  sequence(
    [
      () => {
        t.label("Extra clear");
        t.add(40 * round * 3, 380);
        Snd.fanfare(true);
        Hap.v([10, 40, 10, 40, 24]);
        burstCenter(30, RB, { dist: 130, size: 7 });
        return 700;
      },
      () => {
        const { secs, ms } = drainClock((p) => t.add(p));
        if (!secs) return 0;
        t.label(`Time left · ${secs} sec`);
        return ms + 350;
      },
      () => {
        for (let j = 0; j < made; j++)
          setTimeout(() => {
            if (!alive()) return;
            t.label(`Circles · ${j + 1}`);
            t.add(CIRCLE_BONUS * (j + 1));
            Snd.pluck(660 * Math.pow(2, FIRE_NOTES[Math.min(j, 9)] / 12), 0.1, 0, 0.25);
            Hap.v(3);
            const [x, y] = boardCentre();
            burst(x, y, 6, RB, { r0: 50, dist: 50, size: 5 });
          }, j * 150);
        return made ? made * 150 + 350 : 0;
      },
      () => {
        t.fly(() => {
          if (!alive()) return;
          S.score += t.total;
          showScore();
          saveBest();
          Snd.finale(Math.max(2, S.combo - 1), 0.02);
        }, 480);
        return 680;
      },
      () => {
        $("prev").classList.add("gone");
        return 550;
      },
      () => {
        if (!S.pieces.length) nextRound();
      },
    ],
    alive,
    () => t.remove(),
  );
}
