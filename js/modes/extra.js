/*
 * EXTRA bonus rounds (Endless only): 3-2-1 intro, then clear the board before
 * the countdown ring around the preview runs out. Each circle adds time and
 * raises the multiplier. Clearing it drains the remaining time into points and
 * replays every circle made into the score.
 */
import { S, isEndless } from "../state.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { $, anyOverlayOpen, replay, centerOf } from "../ui/dom.js";
import { RB, colorOf, pathOf } from "../ui/shapes.js";
import { refreshTools, render, status } from "../ui/board.js";
import { RING_C, renderPreview } from "../ui/preview.js";
import { holdScore, scoreHoldLeft, showScore } from "../ui/score.js";
import { burstCenter } from "../ui/fx.js";
import { nextRound, saveBest } from "./endless.js";

const TIME_PER_CIRCLE = 2000; // ms added per circle
const LOW_TIME = 5; // seconds: ring pulses and ticks below this

/** Time allowed for the current board (ms). */
const extraTime = () => Math.round(14 + S.pieces.length * 1.8) * 1000;

const rainbowLetters = (text) =>
  [...text].map((c, i) => `<span style="animation-delay:${i * 0.09}s,${i * -0.3}s">${c}</span>`).join("");

/** Called by nextRound() when the new round is an EXTRA round. */
export function startExtra() {
  $("xtxt").innerHTML = rainbowLetters("EXTRA") + `<em id="xm">×3</em>`;
  extraIntro();
}

/** Subtle 3-2-1 over the dimmed board before the clock starts. */
function extraIntro() {
  S.xTot = S.xLeft = extraTime();
  S.busy = true;
  S.xOn = false;
  S.xCircles = [];
  renderPreview();

  const cd = document.createElement("div"),
    br = $("board").getBoundingClientRect(),
    wr = $("boardwrap").getBoundingClientRect();
  cd.id = "xcd";
  cd.style.cssText = `left:${br.left - wr.left}px;top:${br.top - wr.top}px;width:${br.width}px;height:${br.height}px`;
  $("boardwrap").appendChild(cd);
  $("board").classList.add("dim");

  const round = S.round;
  const alive = () => S.round === round && isEndless() && !S.over;
  status("Chain circles to raise the multiplier");
  [3, 2, 1].forEach((n, i) =>
    setTimeout(() => {
      if (!alive()) return;
      cd.textContent = n;
      replay(cd, "beat");
      Snd.tick(1500 + i * 350, 0.07, 0.02);
      Hap.v(3);
    }, i * 500),
  );
  setTimeout(() => {
    cd.remove();
    if (!alive()) return;
    $("board").classList.remove("dim");
    S.busy = false;
    Hap.v([4, 30, 4]);
    Snd.good(5, 3, true);
    startExtraTimer();
    setTimeout(() => {
      if (!S.busy) status();
    }, 2200);
  }, 1500);
}

/* ---------- countdown ---------- */

let lastFrame = 0,
  lastSecond = 99;

function startExtraTimer() {
  S.xTot = S.xLeft = extraTime();
  S.xOn = true;
  lastFrame = performance.now();
  lastSecond = 99;
  requestAnimationFrame(xTick);
}

function xTick(t) {
  if (!S.xOn) return;
  if (!isEndless() || !$("game").classList.contains("on")) {
    S.xOn = false;
    return;
  }
  const dt = Math.min(80, t - lastFrame);
  lastFrame = t;
  if (!anyOverlayOpen() && !S.busy) S.xLeft -= dt; // paused while any overlay is open

  const p = Math.max(0, S.xLeft / S.xTot),
    secs = Math.ceil(S.xLeft / 1000);
  const ring = $("xring");
  if (ring) {
    ring.style.strokeDashoffset = (RING_C * (1 - p)).toFixed(2);
    ring.classList.toggle("low", secs <= LOW_TIME);
  }
  if (secs < lastSecond) {
    lastSecond = secs;
    if (secs <= LOW_TIME && secs > 0) {
      Snd.tick(2200 + (LOW_TIME - secs) * 260, 0.1, 0.02);
      Hap.v(3);
    }
  }
  if (S.xLeft <= 0) {
    endExtra("Time up");
    return;
  }
  requestAnimationFrame(xTick);
}

/** A circle was completed: remember it for the finale, add time, show the new multiplier. */
export function onExtraCircle(chosen) {
  if (!(S.bonus && S.xOn)) return;
  S.xCircles.push(chosen.map((p) => p.mask));
  S.xLeft = Math.min(S.xTot, S.xLeft + TIME_PER_CIRCLE);
  const m = $("xm");
  if (m) m.textContent = "×" + Math.min(3 + S.combo, 10);
}

/** Failed (time up or stuck): no game over, just move on to the next round. */
export function endExtra(msg) {
  if (!S.xOn) return;
  S.xOn = false;
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

/** EXTRA board cleared in time. Waits for the last circle to land on the score first. */
export function extraFinale() {
  const wait = scoreHoldLeft();
  S.xOn = false;
  S.busy = true;
  S.score += 40 * S.round * 3;
  saveBest();
  render(false);
  setTimeout(() => {
    if (!isEndless()) return;
    holdScore(0);
    showScore();
    extraFinaleRun();
  }, wait);
}

/** Remaining time drains into points, then each circle made flies to the score one by one. */
function extraFinaleRun() {
  const secs = Math.max(0, Math.round(S.xLeft / 1000)),
    made = S.xCircles.slice(),
    p0 = S.xTot ? Math.max(0, S.xLeft / S.xTot) : 0;
  Hap.v([10, 40, 10, 40, 24]);
  status("Time bonus +" + secs * 10);

  // drain the ring and count +10 per second left
  const drainMs = secs ? Math.min(700, Math.max(250, secs * 45)) : 0,
    step = secs ? drainMs / secs : 0;
  if (drainMs) {
    const t0 = performance.now(),
      from = RING_C * (1 - p0);
    const frame = (t) => {
      const k = Math.min(1, (t - t0) / drainMs),
        ring = $("xring");
      if (ring) ring.style.strokeDashoffset = (from + (RING_C - from) * k).toFixed(2);
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  for (let i = 1; i <= secs; i++) {
    setTimeout(() => {
      if (!isEndless()) return;
      S.score += 10;
      showScore();
      Snd.tick(1700 * Math.pow(2, (i * 0.7) / 12), 0.08, 0.02);
      if (i % 3 === 0) Hap.v(2);
    }, i * step);
  }

  // replay the circles, overlapping the end of the drain
  const start = drainMs * 0.7,
    gap = 110;
  made.forEach((masks, j) => setTimeout(() => fireCircle(masks, j), start + j * gap));

  const end = start + made.length * gap + 650;
  setTimeout(() => {
    if (!isEndless()) return;
    Snd.finale(Math.max(0, S.combo - 1), 0.05);
    saveBest();
    burstCenter(16, RB);
  }, end);
  setTimeout(() => $("prev").classList.add("gone"), end + 150);
  setTimeout(() => {
    if (isEndless() && !S.over && !S.pieces.length) nextRound();
  }, end + 700);
}

const FIRE_NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

/** One circle swings from the board centre into the score: +25 each. */
function fireCircle(masks, j) {
  if (!isEndless()) return;
  const wr = $("boardwrap").getBoundingClientRect(),
    sz = Math.min(wr.width, wr.height) * 0.28,
    [cx, cy] = centerOf(wr),
    [tx, ty] = centerOf($("sc").getBoundingClientRect());
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:${cx - sz / 2}px;top:${cy - sz / 2}px;width:${sz}px;height:${sz}px;pointer-events:none;z-index:25;opacity:0`;
  el.innerHTML =
    `<svg viewBox="0 0 100 100" style="width:100%;height:100%;overflow:visible;filter:drop-shadow(0 4px 6px var(--shadow))">` +
    masks.map((m) => `<path fill="${colorOf(m)}" d="${pathOf(m)}"/>`).join("") +
    `</svg>`;
  document.body.appendChild(el);
  Snd.tick(2000 + j * 150, 0.07, 0.02);

  const dx = tx - cx,
    dy = ty - cy,
    swing = (j % 2 ? 1 : -1) * (20 + j * 6), // alternate sides
    endScale = Math.min(0.2, 22 / sz);
  el.animate(
    [
      { opacity: 0, transform: "translate(0,0) scale(.5)", offset: 0 },
      { opacity: 1, transform: `translate(${swing}px,${dy * 0.18}px) scale(1.05)`, offset: 0.22 },
      { opacity: 1, transform: `translate(${dx * 0.5 + swing * 0.4}px,${dy * 0.6}px) scale(.7)`, offset: 0.62 },
      { opacity: 1, transform: `translate(${dx}px,${dy}px) scale(${endScale})`, offset: 0.94 },
      { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(${endScale})`, offset: 1 },
    ],
    { duration: 620, easing: "cubic-bezier(.4,.1,.5,1)" },
  ).onfinish = () => {
    el.remove();
    if (!isEndless()) return;
    S.score += 25;
    showScore();
    Snd.pluck(660 * Math.pow(2, FIRE_NOTES[Math.min(j, 9)] / 12), 0.1, 0, 0.25);
    Hap.v(3);
  };
}
