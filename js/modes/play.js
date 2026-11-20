/*
 * Core interaction shared by both modes (select, complete a circle, undo, hint)
 * plus Classic mode itself (levels, stars, level picker, level cleared).
 */
import { S, prog, isEndless } from "../state.js";
import { store } from "../platform/storage.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { formsCircle, overlaps, solveAll } from "../core/geometry.js";
import { genLevel } from "../core/generate.js";
import { $, show, ov, replay } from "../ui/dom.js";
import { PAL } from "../ui/shapes.js";
import { cellEl, removeCellsAnimated, refreshTools, render, status } from "../ui/board.js";
import { renderPreview, showDone } from "../ui/preview.js";
import { holdScore, scoreHoldLeft, showScore } from "../ui/score.js";
import { assembleCircle, burstCenter, circleTimes } from "../ui/fx.js";
import { levelStars, loseStar, revealWinStars, showWinStars, starsHTML, totalStars } from "../ui/stars.js";
import { checkOver, saveBest, winEndless } from "./endless.js";
import { onExtraCircle } from "./extra.js";
import { stopClock } from "./clock.js";
import { chargeGain } from "./charge.js";

/** EXTRA rounds multiply a circle's points by this (it grows with the combo). */
export const extraMult = (combo) => Math.min(2 + combo, 10);

/** Points for a circle of `count` pieces at the given combo (EXTRA rounds multiply). */
function circleScore(count, combo, bonus) {
  const sizeBonus = 1 + (count - 2) * 0.25,
    comboBonus = 1 + (combo - 1) * 0.5,
    extra = bonus ? extraMult(combo) : 1;
  return Math.round(count * 40 * sizeBonus * comboBonus * extra);
}

/* ---------- classic mode ---------- */

export function startLevel(n) {
  S.mode = "classic";
  S.bonus = false;
  S.over = false;
  stopClock();
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
  S.dead = false;
  S.usedHint = false;
  S.usedUndo = false;
  S.levelStart = S.score;
  show("game");
  render(true);
}

/** Start the current level again (score back to what it was when the level began). */
export function restartLevel() {
  S.score = S.levelStart || 0;
  startLevel(S.level);
}

export function openLevels() {
  Snd.init();
  Snd.select();
  const g = $("lgrid");
  g.innerHTML = "";
  const total = Math.max(30, prog.max + 5);
  for (let n = 1; n <= total; n++) {
    const b = document.createElement("button"),
      stars = prog.stars[n] || 0;
    b.className = "lv" + (n === S.level ? " cur" : "") + (n < prog.max ? " done" : "");
    b.innerHTML = `<span>${n}</span>` + (stars ? `<span class="lvstars">${starsHTML(stars)}</span>` : "");
    b.setAttribute("aria-label", `Level ${n}` + (stars ? `, ${stars} of 3 stars` : ""));
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
  const t = totalStars();
  $("lvTotal").textContent = t ? `· ${t}★` : "";
  ov("ovLvls", true);
  g.querySelector(".cur")?.scrollIntoView({ block: "center" });
}

/** Save the stars of the level just cleared. Returns [stars, earnedHint]. */
function recordStars() {
  const stars = levelStars(),
    before = prog.stars[S.level] || 0,
    earnedHint = stars === 3 && before < 3;
  if (stars > before) {
    prog.stars[S.level] = stars;
    store.set("stars", prog.stars);
  }
  if (earnedHint) {
    prog.hints++;
    store.set("hints", prog.hints);
  }
  return [stars, earnedHint];
}

/** Board cleared (any mode). */
function win() {
  if (isEndless()) {
    winEndless();
    return;
  }
  const [stars, earnedHint] = recordStars();
  Hap.v([10, 50, 10, 50, 30]);
  Snd.level();
  Snd.finale(S.combo - 1);
  render(false);
  if (S.level + 1 > prog.max) {
    prog.max = S.level + 1;
    store.set("max", prog.max);
  }
  setTimeout(() => burstCenter(22, PAL, { dist: 90, size: 6 }), 450); // once the last circle has locked
  $("ws").textContent = S.score.toLocaleString();
  showWinStars(stars, earnedHint);
  setTimeout(() => $("prev").classList.add("gone"), 550);
  const level = S.level;
  setTimeout(
    () => {
      if (S.pieces.length || isEndless() || S.level !== level) return;
      ov("ovWin", true);
      revealWinStars(stars);
    },
    Math.max(950, scoreHoldLeft() + 250), // after the last points land
  );
}

/* ---------- interaction ---------- */

export function tap(id) {
  if (S.busy || S.dead) return;
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

/**
 * The selection forms a full circle: score it, play the circle sequence
 * (ui/fx.js: pieces fly together, lock, the points fly to the score), maybe finish.
 */
function complete() {
  const ids = new Set(S.sel),
    chosen = S.sel.map((id) => S.pieces.find((p) => p.id === id)), // in the order they were picked
    count = chosen.length,
    { lock, land } = circleTimes(count);
  S.hist.push({ pieces: S.pieces.slice(), score: S.score, combo: S.combo, charge: S.charge });
  S.combo++;
  const pts = circleScore(count, S.combo, S.bonus),
    tag = S.bonus ? "×" + extraMult(S.combo) : S.combo > 1 ? "×" + S.combo : "";
  S.score += pts;
  holdScore(performance.now() + land); // count up when the number lands
  onExtraCircle(chosen, lock);
  chargeGain(lock); // normal Endless rounds fill the EXTRA meter
  if (count !== S.pieces.length) {
    // the last circle of a board gets the level-cleared sound instead
    Snd.valid(count, S.combo - 1, 0.14); // a click as each piece lands, impact at lock
    Snd.good(S.combo - 1, count, S.bonus, lock / 1000);
  }

  assembleCircle(chosen, $("board").getBoundingClientRect(), pts, tag);

  removeCellsAnimated(
    [...ids],
    () => {
      S.pieces = S.pieces.filter((p) => !ids.has(p.id));
      S.sel = [];
    },
    false,
  ); // no fade: the pieces fly into the circle instead

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
  checkDeadEnd();
}

/**
 * After a circle: if the pieces left can no longer all be used, stop play.
 * Making more circles would be pointless, so taps are blocked and a panel
 * offers Undo (and Restart in Classic). Endless with no undo left is a
 * game over instead (checkOver).
 */
function checkDeadEnd() {
  if (S.over || S.busy || !S.pieces.length || solveAll(S.pieces)) return;
  S.dead = true;
  const level = S.level,
    round = S.round;
  setTimeout(() => {
    // let the completed circle finish flying first
    if (!S.dead || S.level !== level || S.round !== round) return;
    const en = isEndless();
    $("deadUndo").textContent = en
      ? `Undo last circle · ${S.undos} left`
      : S.usedUndo
        ? "Undo last circle"
        : "Undo last circle · −1★";
    $("deadRestart").style.display = en ? "none" : "";
    $("game").classList.add("deadend");
    Snd.invalid();
    Hap.v([10, 60, 10]);
  }, 650);
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

/** Take back the last circle. Endless: limited budget. Classic: costs the "no undo" star. */
export function undo() {
  if (S.busy || !S.hist.length || (isEndless() && S.undos <= 0)) return;
  if (isEndless()) S.undos--;
  const h = S.hist.pop();
  S.pieces = h.pieces;
  S.score = h.score;
  S.charge = h.charge; // an undone circle takes its EXTRA charge back
  S.combo = 0;
  S.sel = [];
  S.dead = false;
  Snd.deselect();
  render(false);
  if (!isEndless() && !S.usedUndo) {
    S.usedUndo = true;
    loseStar();
  }
  checkOver();
}

/**
 * Pulse the pieces of one circle that keeps the board solvable.
 * Endless: costs 100 points. Classic: uses one hint from stock and the "no hint" star.
 */
export function hint() {
  if (S.busy || S.dead) return;
  Snd.init();
  if (!isEndless() && prog.hints <= 0) {
    // the only place that tells players how hints come back
    replay($("hint"), "nohint");
    Snd.tick(500, 0.1, 0.04);
    status("No hints left: get ★★★ on any level to earn one");
    setTimeout(() => {
      if (!S.busy && !S.dead) status();
    }, 2600);
    return;
  }
  const circle = solveAll(S.pieces)?.[0];
  if (!circle) {
    status("Dead end: the rest can't all fit — Undo");
    return;
  }
  deselectAll();
  if (isEndless()) {
    S.score = Math.max(0, S.score - 100);
    showScore();
  } else {
    prog.hints--;
    store.set("hints", prog.hints);
    if (!S.usedHint) {
      S.usedHint = true;
      loseStar();
    }
    status();
  }
  circle.forEach((p) => replay(cellEl(p.id), "hint"));
  Hap.v(5);
  Snd.tick(1100, 0.1, 0.04);
}
