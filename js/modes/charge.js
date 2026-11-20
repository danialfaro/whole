/*
 * EXTRA charge (Endless): circles made in normal rounds fill the EXTRA meter
 * (ui/meter.js); a full meter makes the next round an EXTRA round. The meter
 * drains slowly between gains, faster at higher rounds, so EXTRAs reward
 * playing quickly and chaining combos.
 */
import { S, isEndless } from "../state.js";
import { $, anyOverlayOpen } from "../ui/dom.js";
import { CHARGE_MAX, flyOrbs, renderMeter } from "../ui/meter.js";

const GRACE = 2000; // ms without draining after each gain

/**
 * A circle was made in a normal Endless round: charge by 1, plus up to 4 more
 * for the combo. The orbs leave when the circle locks (`delay` ms from now).
 */
export function chargeGain(delay = 0) {
  if (!isEndless() || S.bonus) return;
  const gain = 1 + Math.min(S.combo - 1, 4),
    was = S.charge;
  S.charge = Math.min(CHARGE_MAX, was + gain);
  S.chargeGrace = performance.now() + delay + GRACE;
  flyOrbs(Math.min(gain, 4), was < CHARGE_MAX && S.charge >= CHARGE_MAX, delay);
}

/** Starting a round: true (and the meter is emptied) if it should be an EXTRA round. */
export function takeExtra() {
  if (S.charge < CHARGE_MAX) return false;
  S.charge = 0;
  return true;
}

let gen = 0,
  lastFrame = 0;

/** Run the slow drain for this Endless run (stops by itself when the run or screen ends). */
export function startMeter() {
  const g = ++gen;
  lastFrame = performance.now();
  renderMeter();
  const tick = (t) => {
    if (g !== gen || !isEndless() || !$("game").classList.contains("on")) return;
    const dt = Math.min(80, t - lastFrame);
    lastFrame = t;
    const draining =
      !S.bonus && !S.busy && !S.over && !anyOverlayOpen() && t > S.chargeGrace && S.charge > 0 && S.charge < CHARGE_MAX; // a full meter keeps its charge until the EXTRA starts
    if (draining) {
      S.charge = Math.max(0, S.charge - (Math.min(0.12 + 0.02 * S.round, 0.55) * dt) / 1000);
      renderMeter();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
