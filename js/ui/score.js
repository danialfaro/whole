/*
 * Animated score counter. Increases count up with an ease-out; decreases jump.
 * holdScore() delays the count-up so the number changes when a flying circle
 * reaches the counter rather than when it leaves the board.
 */
import { S } from "../state.js";
import { $, replay } from "./dom.js";

let shown = 0,
  raf = 0,
  holdUntil = 0,
  timer = 0;

/** Don't start counting up before `time` (a performance.now() timestamp; 0 = no hold). */
export function holdScore(time) {
  holdUntil = time;
}

/** Milliseconds left on the current hold. */
export const scoreHoldLeft = () => Math.max(0, holdUntil - performance.now());

export function showScore() {
  const el = $("sc"),
    to = S.score;
  cancelAnimationFrame(raf);
  if (to <= shown) {
    clearTimeout(timer);
    shown = to;
    el.textContent = to.toLocaleString();
    return;
  }
  const wait = holdUntil - performance.now();
  if (wait > 0) {
    clearTimeout(timer);
    timer = setTimeout(showScore, wait);
    return;
  }
  const from = shown,
    t0 = performance.now(),
    d = Math.min(900, 320 + (to - from) * 0.5);
  replay(el, "bump");
  const step = (t) => {
    const k = Math.min(1, (t - t0) / d);
    shown = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    el.textContent = shown.toLocaleString();
    if (k < 1) raf = requestAnimationFrame(step);
    else shown = to;
  };
  raf = requestAnimationFrame(step);
}
