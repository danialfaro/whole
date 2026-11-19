/* Subtle haptics (Android/Chromium; iOS Safari has no vibration API). */
import { store } from "./storage.js";

export const Hap = {
  on: store.get("hap", true),
  ok: typeof navigator.vibrate === "function",
  v(pattern) {
    if (this.on && this.ok)
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
  },
};

/** Vibration pattern for completing a circle of `n` pieces at combo `combo`. */
export const hapOk = (n, combo) => {
  const p = [];
  for (let i = 0; i < Math.min(n, 6) - 1; i++) p.push(4, 20);
  p.push(10 + Math.min(n, 8) * 2);
  if (combo > 0) p.push(30, 6);
  return p;
};
