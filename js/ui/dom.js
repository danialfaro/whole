export const $ = (id) => document.getElementById(id);

/** Switch the visible screen (#menu or #game). */
export function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === id));
}

/** Open or close an overlay. */
export function ov(id, on) {
  $(id).classList.toggle("on", on);
}

export const anyOverlayOpen = () => !!document.querySelector(".ov.on");

/** Restart a CSS animation class on an element. */
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export const centerOf = (rect) => [rect.left + rect.width / 2, rect.top + rect.height / 2];
