/* Player settings: sound, vibration, theme. Each is persisted and reflected in the pause menu switches. */
import { store } from "../platform/storage.js";
import { Snd } from "../platform/audio.js";
import { Hap } from "../platform/haptics.js";
import { $ } from "./dom.js";

let theme = store.get("theme", null); // null = follow the system

const systemDark = () => matchMedia("(prefers-color-scheme:dark)").matches;

function applyTheme() {
  if (theme) document.documentElement.dataset.theme = theme;
  $("swTheme").classList.toggle("on", theme ? theme === "dark" : systemDark());
}

function applySnd() {
  $("swSnd").classList.toggle("on", Snd.on);
  $("sndw").style.opacity = Snd.on ? 1 : 0.15;
}

function applyHap() {
  $("swHap").classList.toggle("on", Hap.on);
  $("tgHap").style.display = Hap.ok ? "" : "none";
}

export function initSettings() {
  applyTheme();
  applySnd();
  applyHap();
}

export function toggleSound() {
  Snd.init();
  Snd.on = !Snd.on;
  store.set("snd", Snd.on);
  applySnd();
  Snd.select();
}

export function toggleHaptics() {
  Hap.on = !Hap.on;
  store.set("hap", Hap.on);
  applyHap();
  Hap.v(6);
}

export function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === "dark" : systemDark();
  theme = dark ? "light" : "dark";
  store.set("theme", theme);
  applyTheme();
}
