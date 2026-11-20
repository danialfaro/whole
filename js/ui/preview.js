/*
 * The circle above the board that fills up as pieces are selected (#prev).
 * In Endless it also carries the round clock's ring (#xring, kept up to date
 * by modes/clock.js): plain ink in normal rounds, rainbow in EXTRA rounds.
 */
import { S, isEndless } from "../state.js";
import { $ } from "./dom.js";
import { R, colorOf, pathOf, rbDefs } from "./shapes.js";

export const RING_R = 48.5;
export const RING_C = 2 * Math.PI * RING_R;

let prevIds = new Set(), // pieces already shown, so only new ones get the pop animation
  previewDone = false; // showing a just-completed circle

/** Countdown ring around the preview, sized to the time left this round. */
function ringHTML() {
  const p = S.clockTotal ? Math.max(0, Math.min(1, S.clockLeft / S.clockTotal)) : 1;
  return (
    (S.bonus ? rbDefs("rbR", 0) : "") +
    `<circle id="xring" class="${S.bonus ? "rainbow" : "plain"}" cx="50" cy="50" r="${RING_R}" fill="none" ` +
    (S.bonus ? `stroke="url(#rbR)" ` : "") +
    `stroke-width="3" stroke-linecap="round" stroke-dasharray="${RING_C.toFixed(2)}" ` +
    `stroke-dashoffset="${(RING_C * (1 - p)).toFixed(2)}" transform="rotate(-90 50 50)"/>`
  );
}

function previewSVG(pieces, attrs) {
  const fill = (q) => (S.bonus ? "url(#rbP)" : colorOf(q.mask));
  return (
    `<svg viewBox="0 0 100 100">${S.bonus ? rbDefs("rbP", 0) : ""}${isEndless() ? ringHTML() : ""}` +
    `<circle class="pghost" cx="50" cy="50" r="${R + 3}"/>` +
    pieces.map((q) => `<path ${attrs(q)} fill="${fill(q)}" d="${pathOf(q.mask)}"/>`).join("") +
    `</svg>`
  );
}

/** Draw the current selection. Its paths carry data-id so tapping them deselects. */
export function renderPreview() {
  previewDone = false;
  const p = $("prev");
  p.classList.remove("done", "gone");
  const ps = S.sel.map((id) => S.pieces.find((x) => x.id === id)).filter(Boolean);
  p.innerHTML = previewSVG(ps, (q) => `class="pp${prevIds.has(q.id) ? "" : " new"}" data-id="${q.id}"`);
  prevIds = new Set(ps.map((q) => q.id));
}

/** Briefly show the circle just completed, then return to the (empty) selection. */
export function showDone(chosen) {
  previewDone = true;
  const p = $("prev");
  prevIds = new Set();
  p.classList.add("done");
  p.innerHTML = previewSVG(chosen, () => `class="pp"`);
  setTimeout(() => {
    if (!previewDone) return;
    if (S.pieces.length) renderPreview();
    else {
      previewDone = false;
      p.classList.remove("done");
      p.innerHTML = "";
    }
  }, 380);
}
