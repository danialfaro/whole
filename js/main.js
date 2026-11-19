/*
 * Entry point: the only module with top-level code that calls into other
 * modules (the rest only declare things), so import cycles between the game
 * modules are safe. Wires every button, key and listener.
 */
import { S, isEndless } from "./state.js";
import { Snd } from "./platform/audio.js";
import { FULL, arcMask, selfTest } from "./core/geometry.js";
import { $, show, ov } from "./ui/dom.js";
import { colorOf, pathOf, shapeSVG } from "./ui/shapes.js";
import { bindBoard, layout } from "./ui/board.js";
import { initSettings, toggleHaptics, toggleSound, toggleTheme } from "./ui/settings.js";
import { clearSelection, hint, openLevels, restartLevel, startLevel, tap, undo } from "./modes/play.js";
import { bestLabel, startEndless } from "./modes/endless.js";

selfTest();
initSettings();

/* ---------- static art ---------- */

$("hero").innerHTML =
  `<svg viewBox="0 0 100 100" style="overflow:visible"><g style="filter:drop-shadow(0 4px 5px var(--shadow))">` +
  [arcMask(6, 4), arcMask(0, 2), arcMask(2, 2)]
    .map((m) => `<path fill="${colorOf(m)}" stroke="var(--bg)" stroke-width="1.5" d="${pathOf(m)}"/>`)
    .join("") +
  `</g></svg>`;

const sign = (s) => `<span style="color:var(--mute)">${s}</span>`;
$("demo").innerHTML =
  shapeSVG(arcMask(0, 4)) + sign("+") + shapeSVG(arcMask(4, 4)) + sign("=") + shapeSVG(FULL, { ghost: false });

/* ---------- menu ---------- */

function goMenu() {
  S.xOn = false;
  bestLabel();
  show("menu");
}

$("play").onclick = () => {
  Snd.init();
  Snd.select();
  startLevel(S.level);
};
$("endless").onclick = () => {
  Snd.init();
  Snd.select();
  startEndless();
};
$("how").onclick = () => {
  Snd.init();
  ov("ovHow", true);
};
$("howOk").onclick = () => ov("ovHow", false);
$("lvls").onclick = openLevels;
$("lvOk").onclick = () => ov("ovLvls", false);

/* ---------- game screen ---------- */

bindBoard(tap);
// tapping a piece in the preview deselects it
$("prev").addEventListener("pointerdown", (e) => {
  const id = e.target.dataset?.id;
  if (id) {
    e.preventDefault();
    tap(+id);
  }
});
$("undo").onclick = undo;
$("hint").onclick = hint;
// dead-end panel
$("deadUndo").onclick = undo;
$("deadRestart").onclick = () => {
  Snd.select();
  restartLevel();
};
$("clear").onclick = clearSelection;
$("sndBtn").onclick = toggleSound;

/* ---------- pause ---------- */

$("pauseBtn").onclick = () => {
  Snd.select();
  ov("ovPause", true);
};
$("resume").onclick = () => ov("ovPause", false);
$("tgSnd").onclick = toggleSound;
$("tgHap").onclick = toggleHaptics;
$("tgTheme").onclick = toggleTheme;
$("restart").onclick = () => {
  ov("ovPause", false);
  if (isEndless()) startEndless();
  else restartLevel();
};
$("pLvls").onclick = openLevels;
$("toMenu").onclick = () => {
  ov("ovPause", false);
  goMenu();
};

/* ---------- results ---------- */

$("next").onclick = () => {
  ov("ovWin", false);
  startLevel(S.level + 1);
};
$("again").onclick = () => {
  Snd.select();
  startEndless();
};
$("overMenu").onclick = () => {
  ov("ovOver", false);
  goMenu();
};

/* ---------- global ---------- */

bestLabel();
addEventListener("resize", () => {
  if ($("game").classList.contains("on")) layout();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("game").classList.contains("on")) ov("ovPause", !$("ovPause").classList.contains("on"));
  if (e.key === "z" && (e.ctrlKey || e.metaKey)) undo();
});
document.addEventListener("contextmenu", (e) => e.preventDefault());
