/*
 * SVG for pieces. Everything is drawn in a 100×100 viewBox: circle of radius R
 * centred at (C, C). Colour is a hash of the mask and carries no meaning.
 */
import { N, FULL } from "../core/geometry.js";

export const R = 44;
export const C = 50;

export const PAL = [
  "#c8553d",
  "#2f6f73",
  "#d9a441",
  "#4b5d8f",
  "#8a9a5b",
  "#a45a7a",
  "#7a6a58",
  "#3d8f6b",
  "#c9784a",
  "#5f7f9f",
];
export const RB = ["#ff4d6d", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#9775fa", "#ff4d6d"];

export const colorOf = (m) => PAL[(Math.imul(m, 2654435761) >>> 0) % PAL.length];

/** SVG path for a mask: one pie slice per contiguous run of sectors. */
export function pathOf(mask) {
  if (mask === FULL) return `M${C - R} ${C}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z`;
  const point = (a) => {
    const t = ((a * 45 - 90) * Math.PI) / 180;
    return [(C + R * Math.cos(t)).toFixed(2), (C + R * Math.sin(t)).toFixed(2)];
  };
  let d = "";
  for (let s = 0; s < N; s++) {
    // start only at the first sector of a run
    if (!(mask & (1 << s)) || mask & (1 << (s + N - 1) % N)) continue;
    let len = 0;
    while (mask & (1 << (s + len) % N)) len++;
    const [x0, y0] = point(s),
      [x1, y1] = point(s + len);
    d += `M${C} ${C}L${x0} ${y0}A${R} ${R} 0 ${len > 4 ? 1 : 0} 1 ${x1} ${y1}Z`;
  }
  return d;
}

/**
 * Animated rainbow gradient (SVG "shader") with the given id. Its period equals
 * the gradient vector so it loops seamlessly; `off` staggers the phase so pieces
 * don't shimmer in sync. Reference it with fill="url(#id)".
 */
export const rbDefs = (id, off) => {
  const ph = (performance.now() / 1000 + off * 0.43) % 3;
  const stops = RB.map((c, i) => `<stop offset="${(i / 6).toFixed(3)}" stop-color="${c}"/>`).join("");
  return (
    `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `gradientTransform="translate(${((100 * ph) / 3).toFixed(2)} ${((40 * ph) / 3).toFixed(2)})" ` +
    `x1="0" y1="0" x2="100" y2="40" spreadMethod="repeat">${stops}` +
    `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="100 40" dur="3s" ` +
    `begin="-${ph.toFixed(3)}s" repeatCount="indefinite"/></linearGradient></defs>`
  );
};

/**
 * A piece as SVG. `ghost` draws the dotted full-circle outline behind it;
 * `rainbowId` (any unique number) fills it with the EXTRA rainbow instead of its colour.
 */
export function shapeSVG(mask, { ghost = true, rainbowId = null } = {}) {
  const rb = rainbowId !== null;
  const id = "rb" + rainbowId;
  return (
    `<svg viewBox="0 0 100 100">${rb ? rbDefs(id, rainbowId) : ""}` +
    (ghost ? `<circle class="ghost" cx="50" cy="50" r="${R + 3}"/>` : "") +
    `<path class="shape" fill="${rb ? `url(#${id})` : colorOf(mask)}" d="${pathOf(mask)}"/></svg>`
  );
}
