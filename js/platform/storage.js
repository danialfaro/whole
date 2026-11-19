/*
 * localStorage wrapper. Every key is prefixed "whole:" and never throws.
 * Keys in use: level, max, snd, hap, theme, best (Endless), bestS (Stream).
 * Renaming a key loses players' saved progress.
 */
export const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem("whole:" + key)) ?? fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("whole:" + key, JSON.stringify(value));
    } catch (e) {}
  },
};
