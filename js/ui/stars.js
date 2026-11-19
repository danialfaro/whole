/*
 * Classic-mode stars. A cleared level is worth ★, plus ★ if no hint was used,
 * plus ★ if undo was never used (no trap fallen into). Best results are kept
 * in prog.stars; the first ★★★ on a level earns a hint.
 */
import { S, prog } from "../state.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { $ } from "./dom.js";

// A sunken slot (always there) and the gold star set into it when earned. See .star in base.css.
const STAR_D = "M12 2.6l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z";
const STAR_SVG =
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<path class="slot" filter="url(#starInset)" d="${STAR_D}"/><path class="fill" d="${STAR_D}"/></svg>`;

/** Stars the current level is still worth. */
export const levelStars = () => 1 + (S.usedHint ? 0 : 1) + (S.usedUndo ? 0 : 1);

export const starsHTML = (lit, total = 3) =>
  Array.from({ length: total }, (_, i) => `<i class="star${i < lit ? " on" : ""}">${STAR_SVG}</i>`).join("");

export const totalStars = () => Object.values(prog.stars).reduce((a, b) => a + b, 0);

/** Top bar (classic only): the stars this level is still worth. */
export function renderStarBox() {
  $("stars").innerHTML = starsHTML(levelStars());
}

/** A star was just lost (hint or undo): the last gold star lifts out of its slot. */
export function loseStar() {
  const lit = $("stars").querySelectorAll(".star.on");
  lit[lit.length - 1]?.classList.remove("on");
}

const STAR_FIRST = 250, // ms after the card appears
  STAR_GAP = 280,
  STAR_POP = 450, // sland animation length (overlays.css)
  STAR_LANDS = 0.55; // share of it until the star touches the slot

/**
 * Fill the win card (still hidden): stars and what to try next.
 * `earnedHint`: first ★★★ on this level. The stars pop in one by one when the
 * card is shown; "Next level" stays hidden until revealWinStars() is done.
 */
export function showWinStars(stars, earnedHint) {
  const row = $("wstars");
  row.innerHTML = starsHTML(stars);
  row.querySelectorAll(".fill").forEach((s, i) => (s.style.animationDelay = STAR_FIRST + i * STAR_GAP + "ms"));
  $("next").classList.add("wait");
  let msg;
  if (stars === 3) msg = "Perfect: no hints, no undo." + (earnedHint ? " You earned a hint." : "");
  else if (S.usedHint && S.usedUndo) msg = "Try it without hints or undo for 3 stars.";
  else if (S.usedHint) msg = "Try it without a hint for 3 stars.";
  else msg = "Try it without undo for 3 stars.";
  $("wmsg").textContent = msg;
}

/** Call when the win card opens: a note per star as it lands, then show "Next level". */
export function revealWinStars(stars) {
  const notes = [784, 988, 1175]; // G5 B5 D6: rising, ends on a major triad
  for (let i = 0; i < 3; i++) {
    setTimeout(
      () => {
        if (i < stars) {
          Snd.pluck(notes[i], 0.13, 0, 0.35);
          Hap.v(6);
        } else Snd.tick(420, 0.08, 0.04); // dull click for an empty slot
      },
      STAR_FIRST + i * STAR_GAP + STAR_POP * STAR_LANDS,
    );
  }
  setTimeout(() => $("next").classList.remove("wait"), STAR_FIRST + 2 * STAR_GAP + STAR_POP + 100);
}
