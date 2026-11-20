/* The game screen: board grid, piece cells, status line, tool buttons. */
import { S, prog, isEndless } from "../state.js";
import { solveAll } from "../core/geometry.js";
import { $ } from "./dom.js";
import { shapeSVG } from "./shapes.js";
import { showScore } from "./score.js";
import { renderPreview } from "./preview.js";
import { renderStarBox } from "./stars.js";
import { renderMeter } from "./meter.js";

const GAP = 8,
  PAD = 12,
  MAX_CELL = 150;

export const cellEl = (id) => $("board").querySelector(`[data-id="${id}"]`);

/** A piece button. `delayMs` !== null plays the fade-in after that delay. */
export function mkCell(p, delayMs = null) {
  const el = document.createElement("button");
  el.className = "cell" + (delayMs !== null ? " in" : "") + (S.sel.includes(p.id) ? " sel" : "");
  el.dataset.id = p.id;
  el.setAttribute("aria-label", "piece");
  el.innerHTML = shapeSVG(p.mask, { rainbowId: S.bonus ? p.id : null });
  if (delayMs !== null) el.style.animationDelay = delayMs + "ms";
  return el;
}

/** Board-level listeners (delegated, so cells added later need no wiring). */
export function bindBoard(onTap) {
  const b = $("board");
  b.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    e.preventDefault();
    onTap(+cell.dataset.id);
  });
  // one-shot animation classes clean themselves up
  const ends = { shake: "shake", fin: "in", pulse: "hint" };
  b.addEventListener("animationend", (e) => {
    const cell = e.target;
    if (cell.classList?.contains("cell") && ends[e.animationName]) cell.classList.remove(ends[e.animationName]);
  });
}

let keptSize = null; // the board's size the last time it had pieces

/**
 * Size the grid to fit the space left in #boardwrap (more columns in landscape).
 * An emptied board keeps its space, invisible, so nothing jumps while the
 * round ends (the round-end total shows where the circles were made).
 */
export function layout() {
  const b = $("board");
  if (!S.pieces.length) {
    b.style.visibility = "hidden";
    if (keptSize) [b.style.width, b.style.height] = keptSize;
    else b.style.display = "none";
    return;
  }
  b.style.visibility = b.style.width = b.style.height = b.style.display = "";
  const n = S.pieces.length || 1,
    land = innerWidth > innerHeight * 1.15;
  let cols = n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5;
  if (land) cols = Math.min(cols + 2, n <= 4 ? 4 : 7);
  cols = Math.max(2, Math.min(cols, n));
  const rows = Math.ceil(n / cols),
    wrap = $("boardwrap").getBoundingClientRect();
  const cs = Math.max(
    10,
    Math.min(
      (wrap.width - PAD * 2 - GAP * (cols - 1)) / cols,
      (wrap.height -
        $("prev").offsetHeight -
        $("xhud").offsetHeight -
        $("meter").offsetHeight -
        PAD * 2 -
        GAP * (rows - 1)) /
        rows,
      MAX_CELL,
    ),
  );
  b.style.gridTemplateColumns = `repeat(${cols},${cs}px)`;
  b.style.gap = GAP + "px";
  // the EXTRA header and the EXTRA meter line up with the board's edges
  $("xhud").style.width = $("meter").style.width = cols * cs + GAP * (cols - 1) + PAD * 2 + "px";
  keptSize = [b.offsetWidth + "px", b.offsetHeight + "px"];
}

/** Rebuild the whole game screen from S. `animIn` staggers the cells in. */
export function render(animIn) {
  const en = isEndless();
  $("lv").textContent = en ? S.round : S.level;
  $("lvl").textContent = en ? "Round" : "Level";
  showScore();
  renderStarBox();
  $("game").classList.toggle("bonus", !!S.bonus);
  $("game").classList.toggle("endless", en);
  if (!S.dead) $("game").classList.remove("deadend"); // shown by checkDeadEnd() in play.js

  const b = $("board");
  b.innerHTML = "";
  S.pieces.forEach((p, i) => b.appendChild(mkCell(p, animIn ? i * 18 : null)));

  layout();
  status();
  $("undo").disabled = !S.hist.length || (en && S.undos <= 0);
  $("clear").disabled = !S.sel.length;
  renderPreview();
  if (en) renderMeter();
}

/**
 * Remove the cells of `ids` (with a fade of fixed-position clones, unless
 * `fade` is false), run `update` (mutate S, maybe append new cells), then
 * glide the remaining cells from their old to their new positions (FLIP).
 */
export function removeCellsAnimated(ids, update, fade = true) {
  const board = $("board");
  const first = new Map(
    [...board.children].map((e) => [e.dataset.id, { r: e.getBoundingClientRect(), w: e.offsetWidth }]),
  );
  ids.forEach((id) => {
    const e = cellEl(id);
    if (!e) return;
    if (!fade) {
      e.remove();
      return;
    }
    const r = first.get(String(id)).r,
      c = e.cloneNode(true);
    c.className = "cell";
    c.style.cssText =
      `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;` +
      `margin:0;pointer-events:none;z-index:4`;
    document.body.appendChild(c);
    c.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(.7)" },
      ],
      { duration: 260, easing: "ease-in", fill: "forwards" },
    ).onfinish = () => c.remove();
    e.remove();
  });

  update();
  layout();

  [...board.children].forEach((e) => {
    const f = first.get(e.dataset.id);
    if (!f) return;
    const l = e.getBoundingClientRect();
    const dx = f.r.left + f.r.width / 2 - (l.left + l.width / 2),
      dy = f.r.top + f.r.height / 2 - (l.top + l.height / 2),
      s = f.w / e.offsetWidth;
    if (Math.abs(dx) + Math.abs(dy) > 1 || Math.abs(s - 1) > 0.01) {
      e.animate(
        [
          { translate: `${dx}px ${dy}px`, scale: s },
          { translate: "0 0", scale: 1 },
        ],
        { duration: 380, easing: "cubic-bezier(.3,.7,.2,1)" },
      );
    }
  });
}

let hintShown = null; // what the hint button currently shows: "endless" or the classic hint count

/**
 * Hint button. Endless: its cost in points. Classic: "Hint" plus a notification
 * chip with the hints left; the chip pops when the count goes up (a hint was
 * earned). Only rebuilt when it changes, so the pop is not cut short.
 */
function renderHintButton(en) {
  const now = en ? "endless" : prog.hints;
  if (now === hintShown) return;
  const before = hintShown;
  // hint earned on the level just cleared: the win card hides the button, so keep the
  // old count until the next level is on screen and pop the chip then
  if (!S.pieces.length && typeof before === "number" && now > before) return;
  hintShown = now;
  const h = $("hint");
  if (en) {
    h.textContent = "Hint −100";
    h.removeAttribute("aria-label");
    return;
  }
  h.innerHTML = `Hint<span class="chip${now ? "" : " empty"}">${now}</span>`;
  h.setAttribute("aria-label", `Hint, ${now} left`);
  if (typeof before === "number" && now > before) h.querySelector(".chip").classList.add("gain");
}

/** Status line + tool labels. With `msg`, show that text instead of the board summary. */
export function status(msg) {
  const el = $("status"),
    en = isEndless();
  $("undo").textContent = en ? "Undo · " + S.undos : "Undo";
  renderHintButton(en);
  if (en) $("undo").disabled = !S.hist.length || S.undos <= 0;
  if (msg) {
    el.textContent = msg;
    return;
  }
  const stuck = S.pieces.length && !solveAll(S.pieces);
  // with 0 hints the button stays enabled: tapping it explains how to earn more (play.js)
  $("hint").disabled = !!stuck;
  const combo = S.combo > 1 ? `<span id="combo">Combo ×${S.combo}</span> · ` : "";
  let text;
  if (stuck) text = "Dead end: the rest can't all fit — Undo";
  else if (!S.pieces.length) text = en ? "Round cleared" : "Level complete";
  else text = `${S.pieces.length} pieces left`;
  el.innerHTML = combo + text;
}

export function refreshTools() {
  $("clear").disabled = !S.sel.length;
  renderPreview();
}
