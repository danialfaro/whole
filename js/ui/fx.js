/*
 * One-shot visual effects: particle bursts, the completed-circle sequence and
 * the numbers that carry points to the score.
 *
 * A completed circle (assembleCircle):
 *   1. each selected piece flies from its cell to the middle of the board and
 *      snaps into place (one every GAP ms, in the order they were picked);
 *   2. lock: the circle punches, flashes, sends out rings and particles, and
 *      the board shakes;
 *   3. the circle collapses into its points (+N), which fly to the score.
 * Snd.valid() is timed to the same beats (a click per piece, impact at lock).
 *
 * Round-end bonuses use a tally (tally()): a number in the middle of the board
 * that counts up stage by stage and then flies to the score as one.
 */
import { S } from "../state.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { $, centerOf, replay } from "./dom.js";
import { RB, colorOf, pathOf, rbDefs } from "./shapes.js";

/* ---------- timeline of a completed circle (ms from the tap) ---------- */

const FLIGHT = 140, // a piece's flight from its cell to the circle
  GAP = 50, // between pieces (Snd.valid ticks at the same spacing)
  HOLD = 220, // the locked circle stays before collapsing
  NUM_IN = 80, // the number appears this long after the collapse starts
  NUM_HOLD = 340, // the number hangs before flying
  NUM_FLY = 300; // flight of the number to the score

/** When the circle locks and when its points land on the score (ms after the tap). */
export function circleTimes(n) {
  const lock = FLIGHT + (n - 1) * GAP + 30;
  return { lock, land: lock + HOLD + NUM_IN + NUM_HOLD + NUM_FLY };
}

const onGame = () => $("game").classList.contains("on");

/** Centre of the board (where circles are made), or of the board area if it is hidden. */
export function boardCentre() {
  const r = $("board").getBoundingClientRect();
  return centerOf(r.width ? r : $("boardwrap").getBoundingClientRect());
}

/* ---------- particles ---------- */

/**
 * `n` particles exploding from (x, y), cycling through `colors`.
 * `r0`: start on a ring of that radius (around a circle) instead of the centre.
 */
export function burst(x, y, n, colors, { r0 = 0, dist = 60, size = 5 } = {}) {
  for (let i = 0; i < n; i++) {
    const d = document.createElement("div"),
      a = Math.random() * 6.28,
      s = size * (0.6 + Math.random() * 0.9),
      sx = x + Math.cos(a) * r0,
      sy = y + Math.sin(a) * r0,
      r = dist * (0.6 + Math.random() * 0.9);
    d.className = "pt";
    d.style.cssText = `left:${sx - s / 2}px;top:${sy - s / 2}px;width:${s}px;height:${s}px;background:${colors[i % colors.length]}`;
    document.body.appendChild(d);
    d.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) scale(.2)`, opacity: 0 },
      ],
      { duration: 550 + Math.random() * 350, easing: "cubic-bezier(.1,.7,.3,1)" },
    ).onfinish = () => d.remove();
  }
}

/** Burst from the centre of the board. */
export function burstCenter(n, colors, opts) {
  const [x, y] = boardCentre();
  burst(x, y, n, colors, opts);
}

/** Small kick of the board on impact, stronger with bigger circles. */
function shakeBoard(amp) {
  const a = Math.min(amp, 8);
  $("board").animate(
    [
      { translate: "0 0" },
      { translate: `${a * 0.8}px ${-a * 0.5}px` },
      { translate: `${-a * 0.6}px ${a * 0.4}px` },
      { translate: `${a * 0.3}px ${-a * 0.2}px` },
      { translate: "0 0" },
    ],
    { duration: 200, easing: "ease-out" },
  );
}

/* ---------- numbers flying to the score ---------- */

/**
 * Fly a fixed element (left/top = its centre, see .pts/.tally) into the score
 * counter. `y0`: its current vertical offset, where the previous animation left it.
 */
function flyToScore(el, ms, onLand, y0 = 0) {
  const x = parseFloat(el.style.left),
    y = parseFloat(el.style.top) + y0,
    [tx, ty] = centerOf($("sc").getBoundingClientRect());
  el.animate(
    [
      { transform: `translate(0,${y0}px) scale(1)`, opacity: 1 },
      {
        transform: `translate(${(tx - x) * 0.25}px,${y0 + (ty - y) * 0.15 - 14}px) scale(1.05)`,
        opacity: 1,
        offset: 0.3,
      },
      { transform: `translate(${tx - x}px,${ty - y + y0}px) scale(.32)`, opacity: 1, offset: 0.92 },
      { transform: `translate(${tx - x}px,${ty - y + y0}px) scale(.25)`, opacity: 0 },
    ],
    { duration: ms, easing: "cubic-bezier(.5,0,.75,.3)", fill: "forwards" },
  ).onfinish = () => {
    el.remove();
    onLand?.();
  };
}

/** Points arrived: chime, a spark of particles on the score. `k` raises the pitch. */
function landOnScore(k, colors, big = false) {
  if (!onGame()) return;
  const [x, y] = centerOf($("sc").getBoundingClientRect());
  Snd.coin(k);
  burst(x, y, big ? 18 : 7, colors, { dist: big ? 70 : 34, size: big ? 6 : 4 });
  Hap.v(big ? [6, 30, 12] : 4);
}

/** Size of a points number: grows (slowly) with the points. */
const numSize = (pts) => Math.round(Math.min(64, 26 + 7 * Math.log2(1 + pts / 80)));

/**
 * "+N" popping up at (x, y) and flying to the score after NUM_HOLD.
 * `tag`: small multiplier after the number ("×3"). Rainbow in EXTRA rounds.
 */
function pointsNumber(x, y, pts, tag, colors) {
  const el = document.createElement("div");
  el.className = "pts" + (S.bonus ? " rb" : "");
  el.style.cssText = `left:${x}px;top:${y}px;font-size:${numSize(pts)}px`;
  el.innerHTML = `+${pts.toLocaleString()}` + (tag ? `<i>${tag}</i>` : "");
  document.body.appendChild(el);
  el.animate(
    [
      { transform: "translateY(6px) scale(.2)", opacity: 0 },
      { transform: "translateY(0) scale(1.22)", opacity: 1, offset: 0.25 },
      { transform: "translateY(-2px) scale(.96)", opacity: 1, offset: 0.45 },
      { transform: "translateY(-8px) scale(1)", opacity: 1 },
    ],
    { duration: NUM_HOLD, easing: "ease-out", fill: "forwards" },
  ).onfinish = () => flyToScore(el, NUM_FLY, () => landOnScore(Math.max(0, S.combo - 1), colors), -8);
}

/** Short text floating up from (x, y), e.g. "+2s" next to the EXTRA ring. */
export function floatText(x, y, text, cls = "") {
  const el = document.createElement("div");
  el.className = "float " + cls;
  el.style.cssText = `left:${x}px;top:${y}px`;
  el.textContent = text;
  document.body.appendChild(el);
  el.animate(
    [
      { transform: "translateY(4px) scale(.6)", opacity: 0 },
      { transform: "translateY(-4px) scale(1.15)", opacity: 1, offset: 0.2 },
      { transform: "translateY(-12px) scale(1)", opacity: 1, offset: 0.7 },
      { transform: "translateY(-22px) scale(1)", opacity: 0 },
    ],
    { duration: 900, easing: "ease-out" },
  ).onfinish = () => el.remove();
}

/* ---------- completed circle ---------- */

/**
 * Play the whole completed-circle sequence (see the top of this file).
 * `chosen`: the pieces in the order they were picked; their cells must still be
 * on the board (they are measured here, then removed by the caller).
 * `boardRect`: the board measured before the cells are removed.
 * `pts`, `tag`: the points the circle scored and its multiplier label.
 */
export function assembleCircle(chosen, boardRect, pts, tag) {
  const count = chosen.length,
    br = boardRect,
    wr = $("boardwrap").getBoundingClientRect(),
    sz = Math.max(96, Math.min(260, Math.min(br.width, br.height) * (0.36 + Math.min(count, 8) * 0.03))),
    [bx, by] = centerOf(br),
    { lock } = circleTimes(count),
    bonus = S.bonus,
    colors = bonus ? RB : chosen.map((p) => colorOf(p.mask)),
    combo = S.combo;

  // 1. the pieces fly in from their cells
  const flyers = chosen.map((p, i) => {
    const svg = $("board").querySelector(`[data-id="${p.id}"] svg`);
    if (!svg) return null;
    const r = svg.getBoundingClientRect(),
      el = document.createElement("div"),
      clone = svg.cloneNode(true);
    clone.querySelector(".ghost")?.remove();
    el.className = "fly";
    el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    el.appendChild(clone);
    document.body.appendChild(el);
    const [cx, cy] = centerOf(r);
    el.animate(
      [
        { transform: "translate(0,0) scale(1)" },
        { transform: `translate(${bx - cx}px,${by - cy}px) scale(${sz / r.width})` },
      ],
      { duration: FLIGHT, delay: i * GAP, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" },
    );
    return el;
  });

  // 2. the assembled circle, shown at lock
  const a = document.createElement("div");
  a.className = "asm" + (count >= 3 ? " big" : "");
  a.style.cssText = `width:${sz}px;height:${sz}px;` + `left:${bx - wr.left - sz / 2}px;top:${by - wr.top - sz / 2}px`;
  a.style.setProperty("--k", count);
  const fill = (p) => (bonus ? "url(#rbA)" : colorOf(p.mask));
  a.innerHTML =
    `<svg viewBox="0 0 100 100">${bonus ? rbDefs("rbA", 0) : ""}` +
    chosen
      .map((p) => `<path fill="${fill(p)}" stroke="${fill(p)}" stroke-width=".6" d="${pathOf(p.mask)}"/>`)
      .join("") +
    `</svg>`;
  a.querySelector("svg").style.filter = `drop-shadow(0 6px ${6 + count * 3}px ${bonus ? "#9775fa" : colors[0]})`;
  $("boardwrap").appendChild(a);

  setTimeout(() => {
    flyers.forEach((f) => f?.remove());
    a.classList.add("go"); // shockwave rings (game.css)
    a.animate(
      [
        { opacity: 1, transform: `scale(${1.14 + count * 0.012})`, filter: "brightness(1.7) saturate(1.2)" },
        { opacity: 1, transform: "scale(.97)", filter: "brightness(1.15)", offset: 0.55 },
        { opacity: 1, transform: "scale(1)", filter: "brightness(1)" },
      ],
      { duration: 230, easing: "ease-out", fill: "forwards" },
    );
    burst(bx, by, 6 + count * 3 + Math.min(combo * 2, 8) + (bonus ? 8 : 0), colors, {
      r0: sz * 0.42,
      dist: 46 + count * 7,
      size: 5 + Math.min(count, 6) * 0.4,
    });
    shakeBoard(1.5 + count * 0.7 + Math.min(combo, 5) * 0.5 + (bonus ? 1.5 : 0));
    if (bonus) replay($("board"), "xhit");

    // 3. collapse into the points, which fly to the score
    setTimeout(() => {
      a.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 1, transform: "scale(1.06)", offset: 0.3 },
          { opacity: 0, transform: "scale(.12)" },
        ],
        { duration: 170, easing: "ease-in", fill: "forwards" },
      ).onfinish = () => a.remove();
      setTimeout(() => pointsNumber(bx, by, pts, tag, colors), NUM_IN);
    }, HOLD);
  }, lock);
}

/* ---------- round-end tally ---------- */

/**
 * A points total in the middle of the board that counts up in stages
 * (label + amount), then flies to the score. The caller adds the total to
 * S.score in `fly`'s callback, so the score jumps when the number lands.
 */
export function tally({ rainbow = false } = {}) {
  const [x, y] = boardCentre(),
    el = document.createElement("div");
  el.className = "tally" + (rainbow ? " rb" : "");
  el.style.cssText = `left:${x}px;top:${y}px`;
  el.innerHTML = `<small></small><b>+0</b>`;
  document.body.appendChild(el);
  el.animate(
    [
      { transform: "scale(.4)", opacity: 0 },
      { transform: "scale(1.12)", opacity: 1, offset: 0.6 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: 260, easing: "ease-out" },
  );
  const num = el.querySelector("b"),
    lab = el.querySelector("small");
  let total = 0,
    shown = 0,
    raf = 0;
  const draw = (v) => (num.textContent = "+" + Math.round(v).toLocaleString());
  return {
    get total() {
      return total;
    },
    /** Change the line above the number. */
    label(text) {
      lab.textContent = text;
      replay(lab, "in");
    },
    /** Add `n`, counting up over `ms` (0: at once), with a pop. */
    add(n, ms = 0) {
      const from = shown,
        to = (total += n);
      cancelAnimationFrame(raf);
      replay(num, "pop");
      if (!ms) {
        shown = to;
        draw(to);
        return;
      }
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        shown = from + (to - from) * (1 - Math.pow(1 - k, 2));
        draw(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
    /** Fly the total to the score; `onLand` runs when it arrives. */
    fly(onLand, ms = 420) {
      cancelAnimationFrame(raf);
      draw(total);
      flyToScore(el, ms, () => {
        landOnScore(6, rainbow ? RB : ["#d9a441", "#c8553d", "#2f6f73"], true);
        onLand();
      });
    },
    remove() {
      cancelAnimationFrame(raf);
      el.remove();
    },
  };
}
