/*
 * Sound effects, all synthesised with WebAudio (no asset files).
 * The AudioContext is created lazily by init(), which must run inside a user
 * gesture. Every voice is a no-op while sound is off or before init().
 * `t0` arguments are delays in seconds from now.
 */
import { store } from "./storage.js";
import { Hap, hapOk } from "./haptics.js";

const semi = (s) => Math.pow(2, s / 12);

export const Snd = {
  ctx: null,
  on: store.get("snd", true),
  noise: null,

  init() {
    if (this.ctx) return;
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      this.ctx = new A();
      const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate),
        d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    } catch (e) {}
  },

  /** Resume a context the browser suspended (call from a user gesture). */
  wake() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  get live() {
    return this.on && this.ctx;
  },

  /* ---------- voices ---------- */

  /** Short click: band-passed noise + a falling oscillator. */
  tick(f = 1800, v = 0.18, dur = 0.035, t0 = 0, type = "square") {
    if (!this.live) return;
    const c = this.ctx,
      t = c.currentTime + t0;
    const n = c.createBufferSource();
    n.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(c.destination);
    n.start(t, Math.random() * 0.5, dur + 0.01);
    const o = c.createOscillator(),
      og = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f * 0.6, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.25, t + dur);
    og.gain.setValueAtTime(v * 0.3, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  /** Low sine drop. */
  thump(f = 130, v = 0.35, t0 = 0) {
    if (!this.live) return;
    const c = this.ctx,
      t = c.currentTime + t0,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.14);
  },

  /** Plucked note: triangle + a short sine overtone. */
  pluck(f, v = 0.12, t0 = 0, dur = 0.22) {
    if (!this.live) return;
    const c = this.ctx,
      t = c.currentTime + t0,
      o = c.createOscillator(),
      g = c.createGain(),
      o2 = c.createOscillator(),
      g2 = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o2.type = "sine";
    o2.frequency.setValueAtTime(f * 3, t);
    g2.gain.setValueAtTime(v * 0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.3);
    o.connect(g).connect(c.destination);
    o2.connect(g2).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    o2.start(t);
    o2.stop(t + dur * 0.35);
  },

  /** Low-passed noise knock. */
  clunk(v = 0.3, t0 = 0) {
    if (!this.live) return;
    const c = this.ctx,
      t = c.currentTime + t0,
      n = c.createBufferSource();
    n.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(950, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.07);
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    n.connect(lp).connect(g).connect(c.destination);
    n.start(t, Math.random() * 0.5, 0.1);
  },

  /** Bell-like tine (inharmonic partial) with a click attack. */
  tine(f, v = 0.12, t0 = 0, dur = 0.32) {
    if (!this.live) return;
    const c = this.ctx,
      t = c.currentTime + t0;
    [
      [1, 1, dur],
      [2.76, 0.3, dur * 0.4],
    ].forEach(([m, a, d]) => {
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = "sine";
      o.frequency.value = f * m;
      g.gain.setValueAtTime(v * a, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + d + 0.02);
    });
    this.tick(f * 1.6, v * 0.9, 0.014, t0);
  },

  /* ---------- game events ---------- */

  select(n = 0) {
    Hap.v(3);
    this.tick(2400 * Math.pow(1.09, Math.min(n, 8)), 0.16, 0.03);
  },

  deselect(n = 0) {
    Hap.v(2);
    this.tick(1300 * Math.pow(1.09, Math.min(n, 8)), 0.09, 0.03);
  },

  invalid() {
    Hap.v([8, 40, 8]);
    this.thump(85, 0.22);
    this.tick(500, 0.12, 0.05);
  },

  /** Circle of `n` pieces completed: ticks per piece + thumps, pitched up by combo. */
  valid(n, combo) {
    combo = combo >= 2 ? combo : 0;
    Hap.v(hapOk(n, combo));
    const cf = Math.pow(2, (Math.min(combo, 8) * 1.5) / 12);
    for (let i = 0; i < n; i++) this.tick(2400 * cf * Math.pow(2, (-(n - 1 - i) * 1.1) / 12), 0.14, 0.03, i * 0.05);
    const t = n * 0.05 + 0.03;
    this.tick(900 * cf, 0.3, 0.06, t);
    this.thump(120, 0.4 + n * 0.03, t);
    for (let k = 0; k < Math.max(0, n - 2); k++) this.tick((2600 + k * 400) * cf, 0.12, 0.03, t + 0.05 + k * 0.045);
    if (n >= 3) this.thump(80, 0.3, t + 0.04);
    if (n >= 4) this.thump(60, 0.35, t + 0.09);
    if (n >= 5) this.tick(4200 * cf, 0.15, 0.05, t + 0.1);
    for (let k = 0; k < Math.min(combo, 4); k++) this.tick(3000 + k * 500, 0.1, 0.025, t + 0.06 + k * 0.04);
  },

  /** Melodic layer on top of valid(): a rising arpeggio, longer with more pieces. */
  good(combo = 0, k = 2, extra = false) {
    if (combo === 1) {
      const f = 330 * semi(2) * 2,
        e = 0.05 + 3 * 0.06;
      [0, 5, 7].forEach((s, i) => this.pluck(f * semi(s), 0.1, 0.05 + i * 0.06, 0.2));
      this.pluck(f * semi(7), 0.09, e, 0.32);
      this.pluck(f * 2, 0.07, e, 0.32);
      this.tick(5200, 0.06, 0.03, e);
      if (extra) this.tick(4800, 0.06, 0.02, e + 0.05);
      return;
    }
    combo = combo >= 2 ? combo : 0;
    const root = 330 * semi(Math.min(combo, 8) * 2),
      Q = [0, 2, 4, 7, 9, 12, 14],
      n = Math.min(2 + k, 7);
    for (let i = 0; i < n; i++)
      this.pluck(root * semi(12 - Q[n - 1 - i]), 0.1 + i * 0.008, 0.05 + i * 0.045, 0.18 + i * 0.02);
    const e = 0.05 + n * 0.045;
    this.pluck(root * 4, 0.12, e, 0.38);
    this.tick(5200, 0.07, 0.03, e);
    if (extra) {
      for (let j = 0; j < 4; j++) {
        this.tick(4200 + j * 700, 0.06, 0.02, e + 0.04 + j * 0.05);
        this.pluck(root * 4 * semi(Q[j]), 0.05, e + 0.03 + j * 0.05, 0.2);
      }
    }
  },

  fanfare(extra = false) {
    const P = [0, 4, 7, 12, 16, 19, 24, 28],
      n = extra ? 8 : 5,
      root = 392;
    for (let i = 0; i < n; i++) this.pluck(root * semi(P[i]), 0.12, 0.04 + i * 0.055, 0.3);
    const e = 0.06 + n * 0.055;
    [0, 4, 7, 12].forEach((s) => this.pluck(root * semi(s + 12), 0.09, e, 0.6));
    this.thump(70, 0.3, e);
    for (let j = 0; j < (extra ? 6 : 3); j++) this.tick(4500 + j * 500, 0.06, 0.02, e + 0.05 + j * 0.04);
  },

  /** Board cleared: major arpeggio + chord, starting after `d` seconds. */
  finale(combo = 0, d = 0.55) {
    combo = combo >= 2 ? combo : 0;
    const root = 330 * semi(Math.min(combo, 8) * 2),
      P = [0, 4, 7, 12, 16, 19, 24, 28],
      n = Math.min(3 + combo, 8);
    for (let i = 0; i < n; i++) this.pluck(root * semi(P[i]), 0.1 + i * 0.004, d + i * 0.06, 0.22);
    const e = d + n * 0.06;
    this.pluck(root, 0.1, e, 0.7);
    [12, 16, 19, 24].forEach((s) => this.pluck(root * semi(s), 0.07, e, 0.55));
    for (let j = 0; j < Math.min(combo, 5); j++) this.tick(4400 + j * 450, 0.06, 0.02, e + 0.04 + j * 0.04);
  },

  /** Level cleared: ratchet ticks, a clunk, then a bell chord. */
  level() {
    for (let i = 0; i < 6; i++) this.tick(1000 + i * 170, 0.11 + i * 0.01, 0.028, i * 0.05);
    const s = 0.32;
    this.clunk(0.3, s);
    this.tick(1200, 0.26, 0.05, s);
    [523, 659, 784].forEach((f, i) => this.tine(f, 0.15, s + 0.07 + i * 0.075, 0.24));
    this.tine(1047, 0.17, s + 0.3, 0.6);
    this.tick(1800, 0.16, 0.03, s + 0.3);
  },
};
