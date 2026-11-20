/*
 * The round clock (Endless): every round is timed. It is shown as a ring around
 * the preview (#xring, drawn by ui/preview.js) and as seconds in the top bar
 * (#clock). It is paused while an overlay is open or the game is busy (intros,
 * transitions). Normal rounds end the run when it runs out; EXTRA rounds just
 * move on (extra.js).
 */
import { S, isEndless } from "../state.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { $, anyOverlayOpen } from "../ui/dom.js";
import { RING_C } from "../ui/preview.js";
import { showScore } from "../ui/score.js";

const LOW_TIME = 5; // seconds: ring and counter turn urgent below this
export const TIME_BONUS = 10; // points per second left when a round is cleared

let gen = 0, // bumped on every set/start/stop so an old tick loop stops by itself
  lastFrame = 0,
  lastSecond = 99;

/** Time for a normal round (ms): generous at first, tighter as the rounds go on. */
export function roundTime(pieces, round) {
  const perPiece = Math.max(1.6, 3.2 - round * 0.08); // seconds per piece: 3.1 at round 1, 1.6 from round 20
  return Math.round(8 + pieces * perPiece) * 1000;
}

const secondsLeft = () => Math.ceil(S.clockLeft / 1000);

/** Ring + seconds in the top bar. */
export function renderClock() {
  const p = S.clockTotal ? Math.max(0, Math.min(1, S.clockLeft / S.clockTotal)) : 0,
    secs = secondsLeft(),
    low = S.clockOn && secs <= LOW_TIME;
  const ring = $("xring");
  if (ring) {
    ring.style.strokeDashoffset = (RING_C * (1 - p)).toFixed(2);
    ring.classList.toggle("low", low);
  }
  const c = $("clock");
  c.textContent = secs;
  c.classList.toggle("low", low);
}

/** Load the clock for a new round without starting it (full ring, seconds shown). */
export function setClock(ms) {
  gen++;
  S.clockOn = false;
  S.clockTotal = S.clockLeft = ms;
  renderClock();
}

export function stopClock() {
  gen++;
  S.clockOn = false;
}

/** Start counting down. `timeUp` runs once if the clock reaches 0. */
export function startClock(timeUp) {
  const g = ++gen;
  S.clockOn = true;
  lastFrame = performance.now();
  lastSecond = 99;
  const tick = (t) => {
    if (g !== gen || !S.clockOn) return;
    if (!isEndless() || !$("game").classList.contains("on")) {
      S.clockOn = false;
      return;
    }
    const dt = Math.min(80, t - lastFrame);
    lastFrame = t;
    if (!anyOverlayOpen() && !S.busy) S.clockLeft = Math.max(0, S.clockLeft - dt);
    renderClock();
    const secs = secondsLeft();
    if (secs < lastSecond) {
      lastSecond = secs;
      if (secs <= LOW_TIME && secs > 0) {
        Snd.tick(2200 + (LOW_TIME - secs) * 260, 0.1, 0.02);
        Hap.v(3);
      }
    }
    if (S.clockLeft <= 0) {
      stopClock();
      timeUp();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** EXTRA: a circle buys back some time. */
export function addTime(ms) {
  S.clockLeft = Math.min(S.clockTotal, S.clockLeft + ms);
}

function payScore(points) {
  S.score += points;
  showScore();
}

/**
 * Round cleared: the ring empties and every second left pays TIME_BONUS, by
 * default straight into the score; `pay(points, i)` sends it elsewhere (the
 * round-end tally). Returns { secs, ms }: seconds paid and how long it takes.
 */
export function drainClock(pay = payScore) {
  stopClock();
  const secs = Math.max(0, secondsLeft()),
    ms = secs ? Math.min(700, Math.max(250, secs * 45)) : 0,
    step = secs ? ms / secs : 0,
    from = S.clockLeft,
    round = S.round,
    alive = () => isEndless() && S.round === round;
  if (!secs) return { secs, ms };
  const t0 = performance.now();
  const frame = (t) => {
    if (!alive()) return;
    const k = Math.min(1, (t - t0) / ms);
    S.clockLeft = from * (1 - k);
    renderClock();
    if (k < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  for (let i = 1; i <= secs; i++) {
    setTimeout(() => {
      if (!alive()) return;
      pay(TIME_BONUS, i);
      Snd.tick(1700 * Math.pow(2, (i * 0.7) / 12), 0.08, 0.02);
      if (i % 3 === 0) Hap.v(2);
    }, i * step);
  }
  return { secs, ms };
}
