/*
 * The EXTRA meter (Endless, normal rounds): a thin rainbow bar under the board
 * (#meter). Circles charge it; orbs fly from the board to the bar and it fills
 * when they arrive. When full it reads "EXTRA READY" and the next round is an
 * EXTRA round. The charge logic lives in modes/charge.js.
 */
import { S, isEndless } from "../state.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { $, replay } from "./dom.js";
import { RB } from "./shapes.js";
import { boardCentre, burst } from "./fx.js";
import { status } from "./board.js";

export const CHARGE_MAX = 14;

let gainTimer = 0;

/** Draw the bar at the current charge. `animate`: ease the fill (a gain arriving). */
export function renderMeter(animate = false) {
  const c = S.charge || 0,
    m = $("meter"),
    f = $("mfill");
  if (animate) {
    f.classList.add("gain");
    clearTimeout(gainTimer);
    gainTimer = setTimeout(() => f.classList.remove("gain"), 520);
  }
  f.style.clipPath = `inset(0 ${(1 - Math.min(1, c / CHARGE_MAX)) * 100}% 0 0 round 3px)`;
  m.classList.toggle("full", c >= CHARGE_MAX);
  m.querySelector("small").textContent = c >= CHARGE_MAX ? "EXTRA READY" : "EXTRA";
}

/**
 * `n` orbs fly from the board to the bar's new fill point; the bar fills and
 * bumps as each one lands. `becameFull`: this gain filled it (fanfare on the last orb).
 * `delay`: ms before they leave (the completed circle locking).
 */
export function flyOrbs(n, becameFull, delay = 0) {
  const [cx, cy] = boardCentre(),
    bar = $("meter").querySelector(".mbar").getBoundingClientRect(),
    f = Math.min(1, S.charge / CHARGE_MAX),
    tx = bar.left + bar.width * f,
    ty = bar.top + bar.height / 2,
    round = S.round;
  for (let i = 0; i < n; i++) {
    const o = document.createElement("div");
    o.className = "orb";
    o.style.cssText = `left:${cx - 5}px;top:${cy - 5}px;opacity:0`;
    document.body.appendChild(o);
    const spread = (i - (n - 1) / 2) * 26,
      dx = tx - cx,
      dy = ty - cy;
    o.animate(
      [
        { transform: "translate(0,0) scale(.4)", opacity: 0, offset: 0 },
        { transform: `translate(${spread}px,-24px) scale(1)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${dx * 0.55 + spread}px,${dy * 0.55}px) scale(1)`, opacity: 1, offset: 0.65 },
        { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 1, offset: 0.95 },
        { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0, offset: 1 },
      ],
      { duration: 700 + i * 90, delay: delay + 80, easing: "cubic-bezier(.4,.1,.4,1)" },
    ).onfinish = () => {
      o.remove();
      if (!isEndless() || S.round !== round) return;
      renderMeter(true);
      replay($("meter"), "bump");
      Snd.charge(f);
      Hap.v(2);
      if (becameFull && i === n - 1) {
        Snd.ready();
        Hap.v([6, 30, 6, 30, 14]);
        burst(tx, ty, 16, RB);
        status("Extra ready — it starts next round");
        setTimeout(() => {
          if (!S.busy && !S.dead) status();
        }, 2600);
      }
    };
  }
}
