/* One-shot visual effects: particle bursts and the completed circle flying to the score. */
import { S } from "../state.js";
import { $, centerOf } from "./dom.js";
import { colorOf, pathOf, rbDefs } from "./shapes.js";

/** Duration (ms) of the flight of a completed circle of `count` pieces. */
export const assembleDuration = (count) => 950 + count * 40;

/** `n` particles exploding from (x, y), cycling through `colors`. */
export function burst(x, y, n, colors) {
  for (let i = 0; i < n; i++) {
    const d = document.createElement("div");
    d.className = "pt";
    d.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]}`;
    document.body.appendChild(d);
    const a = Math.random() * 6.28,
      r = 50 + Math.random() * 60;
    d.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) scale(.2)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 250, easing: "cubic-bezier(.1,.7,.3,1)" },
    ).onfinish = () => d.remove();
  }
}

/** Burst from the centre of the board area. */
export function burstCenter(n, colors) {
  const [x, y] = centerOf($("boardwrap").getBoundingClientRect());
  burst(x, y, n, colors);
}

/**
 * The selected pieces assemble into a circle over the board (with ring
 * shockwaves, see .asm in game.css), then fly into the score counter.
 * `boardRect` is measured before the used cells are removed.
 */
export function assembleCircle(chosen, boardRect) {
  const count = chosen.length,
    br = boardRect,
    wr = $("boardwrap").getBoundingClientRect(),
    sz = Math.min(br.width, br.height) * (0.34 + Math.min(count, 8) * 0.03);
  const fill = (p) => (S.bonus ? "url(#rbA)" : colorOf(p.mask));

  const a = document.createElement("div");
  a.className = "asm go" + (count >= 3 ? " big" : "");
  a.style.cssText =
    `width:${sz}px;height:${sz}px;` +
    `left:${br.left - wr.left + br.width / 2 - sz / 2}px;top:${br.top - wr.top + br.height / 2 - sz / 2}px`;
  a.style.setProperty("--k", count);
  a.innerHTML =
    `<svg viewBox="0 0 100 100">${S.bonus ? rbDefs("rbA", 0) : ""}` +
    chosen
      .map((p) => `<path fill="${fill(p)}" stroke="${fill(p)}" stroke-width=".6" d="${pathOf(p.mask)}"/>`)
      .join("") +
    `</svg>`;
  a.querySelector("svg").style.filter = `drop-shadow(0 6px ${6 + count * 3}px ${colorOf(chosen[0].mask)})`;
  $("boardwrap").appendChild(a);

  const [tx, ty] = centerOf($("sc").getBoundingClientRect()),
    [bx, by] = centerOf(br),
    dx = tx - bx,
    dy = ty - by,
    endScale = Math.min(0.22, 22 / sz);
  a.animate(
    [
      { opacity: 0, transform: "translate(0,0) scale(.55)", offset: 0 },
      { opacity: 1, transform: `translate(0,0) scale(${1 + count * 0.02})`, offset: 0.22 },
      { opacity: 1, transform: "translate(0,0) scale(1)", offset: 0.38 },
      { opacity: 1, transform: `translate(${dx}px,${dy}px) scale(${endScale})`, offset: 0.93, easing: "ease-in" },
      { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(${endScale})`, offset: 1 },
    ],
    { duration: assembleDuration(count), easing: "cubic-bezier(.3,.7,.3,1)" },
  ).onfinish = () => {
    a.remove();
    $("sc").animate([{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" });
  };
}
