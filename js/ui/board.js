/* The game screen: board grid, piece cells, status line, tool buttons, stream queue. */
import { S, isEndless, isStream } from "../state.js";
import { anyCircle, solveAll } from "../core/geometry.js";
import { $ } from "./dom.js";
import { shapeSVG } from "./shapes.js";
import { showScore } from "./score.js";
import { renderPreview } from "./preview.js";

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

/** Size the grid to fit the space left in #boardwrap (more columns in landscape). */
export function layout() {
  const n = isStream() ? S.cap : S.pieces.length || 1,
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
      (wrap.height - $("prev").offsetHeight - $("xhud").offsetHeight - PAD * 2 - GAP * (rows - 1)) / rows,
      MAX_CELL,
    ),
  );
  const b = $("board");
  b.style.gridTemplateColumns = `repeat(${cols},${cs}px)`;
  b.style.gap = GAP + "px";
  b.style.display = S.pieces.length ? "" : "none";
  $("xhud").style.width = cols * cs + GAP * (cols - 1) + PAD * 2 + "px";
}

/** Rebuild the whole game screen from S. `animIn` staggers the cells in. */
export function render(animIn) {
  const en = isEndless();
  $("lv").textContent = en ? S.round : S.level;
  $("lvl").textContent = en ? (S.stream ? "Stage" : "Round") : "Level";
  $("modeBox").querySelector("b").textContent = S.stream ? "≋ Stream" : "∞ Endless";
  showScore();
  $("game").classList.toggle("bonus", !!S.bonus);
  $("game").classList.toggle("endless", en);

  const b = $("board");
  b.innerHTML = "";
  S.pieces.forEach((p, i) => b.appendChild(mkCell(p, animIn ? i * 18 : null)));

  layout();
  status();
  $("undo").disabled = !S.hist.length || (en && S.undos <= 0);
  $("clear").disabled = !S.sel.length;
  renderPreview();
  renderQueue();
}

/**
 * Remove the cells of `ids` with a fade (as fixed-position clones), run
 * `update` (mutate S, maybe append new cells), then glide the remaining cells
 * from their old to their new positions (FLIP).
 */
export function removeCellsAnimated(ids, update) {
  const board = $("board");
  const first = new Map(
    [...board.children].map((e) => [e.dataset.id, { r: e.getBoundingClientRect(), w: e.offsetWidth }]),
  );
  ids.forEach((id) => {
    const e = cellEl(id);
    if (!e) return;
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

/** Status line + tool labels. With `msg`, show that text instead of the board summary. */
export function status(msg) {
  const el = $("status"),
    en = isEndless();
  $("undo").textContent = en ? "Undo · " + S.undos : "Undo";
  $("hint").textContent = en ? "Hint −100" : "Hint";
  if (en) $("undo").disabled = !S.hist.length || S.undos <= 0;
  if (msg) {
    el.textContent = msg;
    return;
  }
  const stuck = S.pieces.length && (isStream() ? !anyCircle(S.pieces) : !solveAll(S.pieces));
  $("hint").disabled = !!stuck;
  const combo = S.combo > 1 ? `<span id="combo">Combo ×${S.combo}</span> · ` : "";
  let text;
  if (stuck) text = "No full solution remains — try Undo";
  else if (!S.pieces.length) text = "Level complete";
  else if (isStream()) text = `${S.done}/${S.target} circles`;
  else text = `${S.pieces.length} pieces left`;
  el.innerHTML = combo + text;
}

export function refreshTools() {
  $("clear").disabled = !S.sel.length;
  renderPreview();
}

/** Stream mode: the next pieces waiting to enter the board. */
export function renderQueue() {
  const q = $("qbar");
  if (!isStream()) {
    q.style.display = "none";
    return;
  }
  q.style.display = "flex";
  const next = S.queue.slice(0, 4);
  q.innerHTML = next.length
    ? `<small>Next</small><div>` +
      next.map((p, i) => `<span style="opacity:${1 - i * 0.2}">${shapeSVG(p.mask, { ghost: false })}</span>`).join("") +
      `</div><small>${S.queue.length > 4 ? "+" + (S.queue.length - 4) : ""}</small>`
    : `<small>Last pieces</small>`;
}
