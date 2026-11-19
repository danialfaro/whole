# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Whole" is a mobile-first browser puzzle game: tap pieces (circle sectors) that together tile exactly one full circle. The code is plain HTML, CSS and native ES modules. There is no build step, framework or dependency apart from Google Fonts.

## Running

The game uses ES modules, so it **must be served over HTTP**. Opening `index.html` with `file://` fails. Serve the folder with any static server, for example `npx serve .` or `python -m http.server`, then open it in a browser. To test on a phone, open the same server from the phone over the LAN.

There is no test runner. `selfTest()` in [js/core/geometry.js](js/core/geometry.js) runs on load and calls `console.assert`, so check the browser console for `geometry self-test failed`.

To check modules from the browser console, import them by URL: `const { S } = await import("/js/state.js")`. This returns the same module instance the game uses.

Formatting: `npx prettier --write css js index.html`. The width setting is in [.prettierrc.json](.prettierrc.json).

## Layout

- [index.html](index.html): markup only. It links the CSS files and loads `js/main.js` as a module.
- `css/`
  - `base.css`: design tokens, theme, reset, buttons, menu.
  - `game.css`: board, pieces, preview, EXTRA HUD, stream queue.
  - `overlays.css`: the cards shown over the game.
- `js/core/`: pure logic, with no DOM and no game state.
  - `geometry.js`: masks and solvers.
  - `generate.js`: board generation.
- `js/platform/`: browser services.
  - `storage.js`: the `store` wrapper over localStorage.
  - `audio.js`: `Snd`, sounds synthesised with WebAudio.
  - `haptics.js`: `Hap`, vibration.
- [js/state.js](js/state.js): the single mutable state object `S`, plus `prog` and the `isEndless()` / `isStream()` helpers.
- `js/ui/`: rendering.
  - `board.js`: grid, cells, status line, queue.
  - `preview.js`: the circle above the board and the EXTRA countdown ring.
  - `score.js`: the animated score counter.
  - `fx.js`: particles and the completed circle flying to the score.
  - `shapes.js`: SVG for pieces.
  - `settings.js`: sound, vibration and theme toggles.
  - `dom.js`: `$`, `show`, `ov`.
- `js/modes/`
  - `play.js`: tap / complete / undo / hint, shared by all modes, plus Classic levels.
  - `endless.js`: Endless and Stream runs.
  - `extra.js`: timed EXTRA bonus rounds.
- [js/main.js](js/main.js): the entry point. It wires every button, key and listener.

## Architecture

**Geometry model.** A circle is split into `N = 8` sectors of 45°, and a piece is an 8-bit mask (`FULL = 255`). Sector 0 starts at 12 o'clock and the sectors go clockwise (see `pathOf` in `ui/shapes.js`). Pieces never rotate. A piece's colour is a hash of its mask and has no gameplay meaning.
- `circles()` lists every way to complete a circle. It always extends from the lowest uncovered sector, so each set is produced once.
- `solveAll()` splits the whole board into circles exactly. It is used to detect a stuck board in Classic and Endless.
- Stream only needs *one* possible circle, so it uses `anyCircle()` instead.

**Generation is deterministic.** `genLevel(n)` is seeded through `rng` (mulberry32). It cuts whole circles into the partitions listed in `TIERS`, so every board is solvable. Each classic level number always gives the same board. Changing the order or number of `rng()` calls in `generate.js` changes every classic level. If you touch that code, compare the output of `genLevel(1..30)` before and after.

**Modes.**
- `S.mode` is `"classic"` or `"endless"`. Stream is Endless with `S.stream` set, so use `isStream()` rather than checking one flag.
- EXTRA rounds (`S.bonus`, `S.xOn`) only happen in Endless, never in Stream. Their countdown is `#xring`, a ring drawn inside the `#prev` preview, and it pauses while any overlay is open.

**Render flow.**
- `render(animIn)` in `ui/board.js` rebuilds the whole screen from `S`.
- Completing a circle (`complete()` in `modes/play.js`) does *not* call `render`. Instead `removeCellsAnimated()` fades out the used cells, mutates `S`, and glides the remaining cells into place (FLIP). After that, `hud()` refreshes only the status, tools and preview.
- The score counter waits for the flying circle to land before counting up: `holdScore()` / `scoreHoldLeft()` in `ui/score.js`.
- Cell taps and the end of one-shot animations are handled by listeners on `#board` itself (`bindBoard`), so newly added cells need no wiring.

**Module rules.**
- `core/` and `platform/` never import from `ui/` or `modes/`.
- Some modules import each other in cycles: `play ↔ endless ↔ extra`. This is safe only because those modules just declare functions. **Only `main.js` runs top-level code that calls into other modules.** Keep it that way.
- An imported `let` binding cannot be reassigned from another module. Shared mutable values therefore live in `S`, or behind a setter such as `holdScore()`.

**Async guards.** Many `setTimeout`/rAF callbacks first check that the same run is still going, using `isEndless()`, `!S.over`, `S.round === round` (see `alive()` in `extraIntro`). The player can quit or restart mid-animation, so keep this pattern for any new delayed callback.

**Persistence.** `store` prefixes every localStorage key with `whole:`. The keys are `level`, `max`, `snd`, `hap`, `theme`, `best` and `bestS`. Renaming any of them loses players' saved progress.

**Theme.** Colours are CSS variables on `:root` in `base.css`. The dark values are defined twice: once for the system preference (`prefers-color-scheme`) and once for the explicit toggle (`[data-theme="dark"]`). Change both blocks together.

**Audio.** `Snd.init()` / `Snd.wake()` must run inside a user gesture before any sound plays.
