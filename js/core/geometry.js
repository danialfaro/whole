/*
 * Circle geometry and solvers. Pure: no DOM, no game state.
 *
 * A circle is split into N = 8 sectors of 45°. A piece is an 8-bit mask of the
 * sectors it covers; sector 0 starts at 12 o'clock and they go clockwise.
 * Pieces never rotate. A board piece is { id, mask }.
 */

export const N = 8;
export const FULL = 255;

/** Number of sectors covered by a mask. */
export const pop = (m) => {
  let c = 0;
  while (m) {
    c += m & 1;
    m >>= 1;
  }
  return c;
};

/** Contiguous arc of `len` sectors starting at sector `start` (wraps around). */
export const arcMask = (start, len) => {
  let m = 0;
  for (let i = 0; i < len; i++) m |= 1 << (start + i) % N;
  return m;
};

/** Does this multiset of masks tile one circle exactly (no gaps, no overlaps)? */
export function formsCircle(masks) {
  let union = 0,
    total = 0;
  for (const m of masks) {
    if (union & m) return false;
    union |= m;
    total += pop(m);
  }
  return union === FULL && total === N;
}

export const overlaps = (masks) => {
  let union = 0;
  for (const m of masks) {
    if (union & m) return true;
    union |= m;
  }
  return false;
};

/**
 * Enumerate every way to complete a circle from `chosen` using pieces in `rest`.
 * Always extends from the lowest uncovered sector, so each set is yielded once.
 */
export function* circles(rest, union, chosen) {
  if (union === FULL) {
    yield chosen;
    return;
  }
  let low = 0;
  while (union & (1 << low)) low++;
  for (let i = 0; i < rest.length; i++) {
    const q = rest[i];
    if (q.mask & (1 << low) && !(q.mask & union)) {
      yield* circles(
        rest.filter((_, j) => j !== i),
        union | q.mask,
        [...chosen, q],
      );
    }
  }
}

/** Exact partition of the whole piece list into circles, or null if impossible. */
export function solveAll(list) {
  if (!list.length) return [];
  const [p0, ...rest] = list;
  for (const ch of circles(rest, p0.mask, [p0])) {
    const ids = new Set(ch.map((p) => p.id));
    const sub = solveAll(list.filter((p) => !ids.has(p.id)));
    if (sub) return [ch, ...sub];
  }
  return null;
}

export function selfTest() {
  const T = arcMask(0, 4),
    B = arcMask(4, 4),
    L = arcMask(6, 4),
    Q = [0, 2, 4, 6].map((s) => arcMask(s, 2));
  const ok = [
    formsCircle([T, B]),
    !formsCircle([T, T]),
    formsCircle(Q),
    !formsCircle([Q[0], Q[0], Q[2], Q[3]]),
    formsCircle([arcMask(4, 4), arcMask(0, 2), arcMask(2, 2)]),
    !formsCircle([T, Q[2]]),
    overlaps([T, L]),
    !overlaps([T, B]),
    solveAll([
      { id: 1, mask: T },
      { id: 2, mask: T },
      { id: 3, mask: B },
      { id: 4, mask: B },
    ])?.length === 2,
  ];
  console.assert(ok.every(Boolean), "geometry self-test failed", ok);
  return ok.every(Boolean);
}
