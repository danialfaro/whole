/*
 * Core interaction shared by every mode (select, complete a circle, undo, hint)
 * plus Classic mode itself (levels, level picker, level cleared).
 */
import { S, prog, isEndless, isStream } from "../state.js";
import { store } from "../platform/storage.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { anyCircle, formsCircle, overlaps, solveAll } from "../core/geometry.js";
import { genLevel } from "../core/generate.js";
import { $, show, ov, replay, centerOf } from "../ui/dom.js";
import { PAL, colorOf } from "../ui/shapes.js";
import { cellEl, removeCellsAnimated, refreshTools, render, status } from "../ui/board.js";
import { renderPreview, showDone } from "../ui/preview.js";
import { holdScore, showScore } from "../ui/score.js";
import { assembleCircle, assembleDuration, burst, burstCenter } from "../ui/fx.js";
import { checkOver, refill, saveBest, winEndless } from "./endless.js";
import { onExtraCircle } from "./extra.js";

/** Points for a circle of `count` pieces at the given combo (EXTRA rounds multiply). */
function circleScore(count, combo, bonus) {
  const sizeBonus = 1 + (count - 2) * 0.25,
    comboBonus = 1 + (combo - 1) * 0.5,
    extra = bonus ? Math.min(2 + combo, 10) : 1;
  return Math.round(count * 40 * sizeBonus * comboBonus * extra);
}

/* ---------- classic mode ---------- */

export function startLevel(n) {
  S.mode = "classic";
  S.stream = false;
  S.bonus = false;
  S.over = false;
  S.xOn = false;
  $("pLvls").style.display = "";
  $("restart").textContent = "Restart level";
  S.level = n;
  store.set("level", n);
  if (n > prog.max) {
    prog.max = n;
    store.set("max", n);
  }
  S.pieces = genLevel(n);
  S.sel = [];
  S.combo = 0;
  S.hist = [];
  S.busy = false;
  S.levelStart = S.score;
  show("game");
  render(true);
}

export function openLevels() {
  Snd.init();
  Snd.select();
  const g = $("lgrid");
  g.innerHTML = "";
  const total = Math.max(30, prog.max + 5);
  for (let n = 1; n <= total; n++) {
    const b = document.createElement("button");
    b.className = "lv" + (n === S.level ? " cur" : "") + (n < prog.max ? " done" : "");
    b.textContent = n;
    b.disabled = n > prog.max;
    b.onclick = () => {
      Snd.select();
      ov("ovLvls", false);
      ov("ovPause", false);
      ov("ovWin", false);
      S.score = 0;
      startLevel(n);
    };
    g.appendChild(b);
  }
  ov("ovLvls", true);
  g.querySelector(".cur")?.scrollIntoView({ block: "center" });
}

/** Board cleared (any mode). */
function win() {
  if (isEndless()) {
    winEndless();
    return;
  }
  Hap.v([10, 50, 10, 50, 30]);
  Snd.level();
  Snd.finale(S.combo - 1);
  render(false);
  if (S.level + 1 > prog.max) {
    prog.max = S.level + 1;
    store.set("max", prog.max);
  }
  burstCenter(18, PAL);
  $("ws").textContent = S.score.toLocaleString();
  setTimeout(() => $("prev").classList.add("gone"), 550);
  setTimeout(() => {
    if (!S.pieces.length) ov("ovWin", true);
  }, 950);
}

/* ---------- interaction ---------- */

export function tap(id) {
  if (S.busy) return;
  Snd.wake();
  const p = S.pieces.find((x) => x.id === id),
    el = cellEl(id);

  if (S.sel.includes(id)) {
    S.sel = S.sel.filter((x) => x !== id);
    el.classList.remove("sel");
    Snd.deselect(S.sel.length);
    refreshTools();
    return;
  }

  const masks = S.sel.map((i) => S.pieces.find((x) => x.id === i).mask);
  if (overlaps([...masks, p.mask])) {
    replay(el, "shake");
    Snd.invalid();
    S.combo = 0;
    status("Those overlap — pick a piece that fills the gap");
    setTimeout(() => {
      if (!S.busy) status();
    }, 1400);
    return;
  }

  S.sel.push(id);
  el.classList.add("sel");
  Snd.select(S.sel.length - 1);
  if (formsCircle([...masks, p.mask])) complete();
  else refreshTools();
}

/** The selection forms a full circle: score it, animate it away, refill or finish. */
function complete() {
  const ids = new Set(S.sel),
    chosen = S.pieces.filter((p) => ids.has(p.id)),
    count = chosen.length;
  S.hist.push({ pieces: S.pieces.slice(), score: S.score, combo: S.combo, queue: S.queue.slice(), done: S.done });
  S.combo++;
  S.score += circleScore(count, S.combo, S.bonus);
  holdScore(performance.now() + 0.93 * assembleDuration(count)); // count up when the circle lands
  onExtraCircle(chosen);
  if (count !== S.pieces.length) {
    // the last circle of a board gets the level-cleared sound instead
    Snd.valid(count, S.combo - 1);
    Snd.good(S.combo - 1, count, S.bonus);
  }

  const br = $("board").getBoundingClientRect(),
    [bx, by] = centerOf(br);
  assembleCircle(chosen, br);
  burst(
    bx,
    by,
    4 + count * 3 + Math.min(S.combo * 2, 8),
    chosen.map((p) => colorOf(p.mask)),
  );

  removeCellsAnimated([...ids], () => {
    S.pieces = S.pieces.filter((p) => !ids.has(p.id));
    S.sel = [];
    if (isStream()) refill();
  });

  if (!S.pieces.length) win();
  else hud();
  showDone(chosen);
}

/** Light refresh after a circle (render() would restart every cell animation). */
function hud() {
  showScore();
  $("undo").disabled = !S.hist.length;
  $("clear").disabled = !S.sel.length;
  status();
  renderPreview();
  saveBest();
  checkOver();
}

function deselectAll() {
  S.sel.forEach((id) => cellEl(id)?.classList.remove("sel"));
  S.sel = [];
  refreshTools();
}

export function clearSelection() {
  deselectAll();
  Snd.deselect();
}

export function undo() {
  if (S.busy || !S.hist.length || (isEndless() && S.undos <= 0)) return;
  if (isEndless()) S.undos--;
  const h = S.hist.pop();
  S.pieces = h.pieces;
  S.score = h.score;
  if (isStream()) {
    S.queue = h.queue;
    S.done = h.done;
  }
  S.combo = 0;
  S.sel = [];
  Snd.deselect();
  render(false);
  checkOver();
}

/** Pulse the pieces of one circle that keeps the board solvable (costs points in endless). */
export function hint() {
  if (S.busy) return;
  Snd.init();
  let circle;
  if (isStream()) circle = anyCircle(S.pieces);
  else circle = solveAll(S.pieces)?.[0];
  if (!circle) {
    status("No full solution remains — try Undo");
    return;
  }
  deselectAll();
  if (isEndless()) {
    S.score = Math.max(0, S.score - 100);
    showScore();
  }
  circle.forEach((p) => replay(cellEl(p.id), "hint"));
  Hap.v(5);
  Snd.tick(1100, 0.1, 0.04);
}
