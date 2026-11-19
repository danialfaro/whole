# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Whole" is a mobile-first browser puzzle game: tap pieces (circle sectors) that together tile exactly one full circle. The entire game is in a single file, [index.html](index.html): CSS in `<style>`, markup, and one `<script>` with no dependencies apart from Google Fonts.

## Running

There is no build step, package manager, linter or test runner. Open `index.html` directly in a browser, or serve the folder statically (for example `python -m http.server`) to test on a phone over the LAN.

The only automated check is `selfTest()`, which runs on load and calls `console.assert` on the geometry functions. After changing geometry or solver code, check the browser console for `geometry self-test failed`.

## Architecture (inside the `<script>`, in this order)

**Geometry model.** A circle is split into `N = 8` sectors of 45°, and a piece is an 8-bit mask (`FULL = 255`). Sector 0 starts at 12 o'clock and the sectors go clockwise (see `pathOf`). Pieces are contiguous arcs made with `arcMask(start, len)`, and they never rotate. A piece's colour comes from a hash of its mask (`colorOf`) and has no gameplay meaning.
- `formsCircle` / `overlaps`: check a selection.
- `circles()`: a generator that lists every way to complete a circle. It always extends from the lowest uncovered sector, so each set of pieces is produced once.
- `solveAll()`: backtracking that splits the whole board into circles exactly. It is used to detect a stuck board (classic and endless) and to give hints.
- `anyCircle()`: Stream mode only needs *one* circle to be possible, so it uses this instead of `solveAll`.

**Generation.** `genLevel(n, salt, base)` is deterministic per level through the seeded `rng` (mulberry32). It builds a board by cutting whole circles into the partitions listed in `TIERS[tier]` (`tier = floor((n-1)/2)`), shuffles the pieces, and checks with `solveAll`, retrying with a new `salt` if needed. Classic levels are reproducible from `n` alone. Endless mode passes a random `base`. `setupStream()` builds an ordered piece sequence and splits it into board (`S.cap`) and `S.queue`.

**State.** Everything lives in one mutable global object `S`:
- `S.mode` is `"classic"` or `"endless"`. Stream is `S.mode === "endless" && S.stream`, so check both flags.
- `S.bonus` / `S.xOn` drive the timed "EXTRA" bonus rounds (endless only, never in stream). The countdown is the rainbow ring drawn around the `#prev` preview (`ringHTML`, `xTick`). `#xbar` is hidden.
- `S.hist` holds snapshots for undo: pieces, score, combo, queue, done. Endless mode limits undos to `S.undos`.
- `S.busy` blocks input during intros and transitions.

**Render flow.**
- `render(animIn)` rebuilds the whole board.
- `complete()` (when a circle is formed) does *not* call `render`. Instead it removes the used cells, re-lays out the board and animates the remaining cells into place (FLIP). It also flies an assembled circle to the score, then calls `hud()` for a partial UI update or `win()`.
- `layout()` sizes the grid from the space available in `#boardwrap`.
- The score counter (`showScore`) waits until `scHold` before counting up, so the number changes when the flying circle arrives.

**Async guards.** Many `setTimeout`/rAF callbacks check that the run is still the same one before acting, for example `S.mode === "endless"`, `!S.over`, `S.round === round` (see `alive()` in `extraIntro`). The player can quit or restart in the middle of an animation, so keep this pattern for any new delayed callback.

**Audio and haptics.** All sounds are synthesised with WebAudio in `Snd`; there are no asset files. The context is created lazily on the first user gesture (`Snd.init()`). `levelOld` and `levelOld2` are unused alternate sounds. `Hap` wraps `navigator.vibrate`, and its toggle is hidden where the API is missing (iOS).

**Persistence.** `store` wraps `localStorage`, with every key prefixed `whole:`. Keys: `level`, `max` (highest unlocked level), `snd`, `hap`, `theme`, `best` (endless), `bestS` (stream).

**UI plumbing.**
- Screens (`.screen`) are switched with `show(id)`; overlays (`.ov`) with `ov(id, on)`.
- The EXTRA timer pauses while any overlay is open.
- Theme: colours are CSS variables on `:root`. Dark values are defined twice: under `prefers-color-scheme: dark` (guarded by `:not([data-theme="light"])`) and under `[data-theme="dark"]`. Change both blocks together.

## Conventions

- The JS is written as dense one-liners with short names (`S`, `$`, `ov`, `p`, `k`). Match that style when editing nearby code rather than reformatting large regions.
- Everything stays in `index.html`; do not add files, frameworks or a build step unless asked.
