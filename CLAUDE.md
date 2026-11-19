# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Whole" is a mobile-first browser puzzle game: tap pieces (circle sectors) that together tile exactly one full circle. The code is plain HTML, CSS and native ES modules. There is no build step, framework or dependency apart from Google Fonts.

## Running

The game uses ES modules, so it **must be served over HTTP**. Opening `index.html` with `file://` fails. Serve the folder with any static server, for example `npx serve .` or `python -m http.server`, then open it in a browser. To test on a phone, open the same server from the phone over the LAN.

There is no test runner. `selfTest()` in [js/core/geometry.js](js/core/geometry.js) runs on load and calls `console.assert`, so check the browser console for `geometry self-test failed`.

To check modules from the browser console, import them by URL: `const { S } = await import("/js/state.js")`. This returns the same module instance the game uses.

Formatting: `npx prettier --write css js tools index.html`. The width setting is in [.prettierrc.json](.prettierrc.json).

Classic levels are precomputed with `node tools/build-levels.mjs [levels=100] [tries=1500]` (about 2 minutes). It rewrites [js/core/levels.js](js/core/levels.js) and prints the difficulty curve. Re-run it after changing `LEVEL_PLAN`, `buildBoard` or the difficulty measure, and check the `check` column against `target`.

## Layout

- [index.html](index.html): markup only. It links the CSS files and loads `js/main.js` as a module.
- `css/`
  - `base.css`: design tokens, theme, reset, buttons, menu.
  - `game.css`: board, pieces, preview, EXTRA HUD.
  - `overlays.css`: the cards shown over the game.
- `js/core/`: pure logic, with no DOM and no game state.
  - `geometry.js`: masks and solvers.
  - `difficulty.js`: measures how hard a board is.
  - `generate.js`: board generation (Classic and Endless).
  - `levels.js`: generated table of the board chosen for each classic level.
  - `rng.js`: seeded random numbers.
- `tools/build-levels.mjs`: dev script that writes `levels.js`. The game never loads it.
- `js/platform/`: browser services.
  - `storage.js`: the `store` wrapper over localStorage.
  - `audio.js`: `Snd`, sounds synthesised with WebAudio.
  - `haptics.js`: `Hap`, vibration.
- [js/state.js](js/state.js): the single mutable state object `S`, plus `prog` (saved Classic progress: unlocked level, stars, hints) and `isEndless()`.
- `js/ui/`: rendering.
  - `board.js`: grid, cells, status line, tool labels.
  - `stars.js`: Classic stars (top bar, win card, level grid).
  - `preview.js`: the circle above the board and the EXTRA countdown ring.
  - `score.js`: the animated score counter.
  - `fx.js`: particles and the completed circle flying to the score.
  - `shapes.js`: SVG for pieces.
  - `settings.js`: sound, vibration and theme toggles.
  - `dom.js`: `$`, `show`, `ov`.
- `js/modes/`
  - `play.js`: tap / complete / undo / hint, shared by both modes, plus Classic levels and stars.
  - `endless.js`: Endless runs.
  - `extra.js`: timed EXTRA bonus rounds.
- [js/main.js](js/main.js): the entry point. It wires every button, key and listener.

## Architecture

**Geometry model.** A circle is split into `N = 8` sectors of 45°, and a piece is an 8-bit mask (`FULL = 255`). Sector 0 starts at 12 o'clock and the sectors go clockwise (see `pathOf` in `ui/shapes.js`). Pieces never rotate. A piece's colour is a hash of its mask and has no gameplay meaning.
- `circles()` lists every way to complete a circle. It always extends from the lowest uncovered sector, so each set is produced once.
- `solveAll()` splits the whole board into circles exactly. It detects a dead end: a board where you can still make circles, but the remaining pieces can no longer all be used.

**Difficulty = traps.** Every board is made by cutting whole circles into arcs, so a solution always exists. A board is hard when some circles that look valid are *traps*: making one leaves pieces that can no longer all fit. `stuckRate()` in `difficulty.js` measures this. It is the share of seeded random playthroughs (pick any possible circle, repeat) that end stuck. 0 means the board needs no thought, which was the case for the old levels 1-8. Reachable rates are limited by board size: about 35% with 3 circles, 60% with 4, 85% with 5.

**Classic levels.**
- `LEVEL_PLAN` in `generate.js` sets, for each stage of levels: the circle count, the allowed ways to cut a circle, whether arcs are aligned to even sectors (aligned means no ambiguity), the maximum piece count, and a target stuck rate.
- `pickBoard(n, tries)` builds `tries` candidates and keeps the one closest to the target.
- `genLevel(n)` = `buildBoard(n, LEVEL_SALTS[n-1])`, using the table in `levels.js`. Levels past the table are picked at runtime with 40 candidates, taking ~150-250 ms.
- Everything is seeded, so a level number always gives the same board. Changing `LEVEL_PLAN`, `buildBoard` or the rng call order changes the levels: regenerate the table.

**Dead ends.** After each circle, `checkDeadEnd()` in `modes/play.js` checks whether the pieces left can still all be used (`solveAll`). If not:
- `S.dead` is set, which blocks taps and hints.
- 650 ms later, `#game.deadend` greys out the board and shows the `#deadEnd` panel. It offers Undo; Classic also offers Restart.
- `render()` clears the state after Undo, a restart or a new round.
- In Endless with no undo left, it is a game over instead (`checkOver`).

**Endless boards** come from `genEndless(difficulty, base)`. It is the original generator (`TIERS`, random `base`) and is separate from the Classic curve.

**Modes.**
- `S.mode` is `"classic"` or `"endless"`. A third mode, Stream, was removed in the commit after `d40ed60`. Its code is in git history.
- EXTRA rounds (`S.bonus`, `S.xOn`) only happen in Endless. Their countdown is `#xring`, a ring drawn inside the `#prev` preview, and it pauses while any overlay is open.

**Stars and hints (Classic only).**
- Each level gives ★ for clearing it, +★ if no hint was used (`S.usedHint`) and +★ if undo was never used (`S.usedUndo`). Both flags reset in `startLevel()`, so restarting a level wipes them.
- The best result per level is kept in `prog.stars`.
- Hints are limited (`prog.hints`, starting at 3). The first ★★★ on a level earns one more.
- Undo stays unlimited: its cost is the third star.
- Endless keeps its own rules: hints cost 100 points and there are 3 undos per run.

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

**Persistence.** `store` prefixes every localStorage key with `whole:`. The keys are `level`, `max`, `stars`, `hints`, `best`, `snd`, `hap` and `theme`. `bestS` is left over from Stream and is no longer read. Renaming any key loses players' saved progress.

**Theme.** Colours are CSS variables on `:root` in `base.css`. The dark values are defined twice: once for the system preference (`prefers-color-scheme`) and once for the explicit toggle (`[data-theme="dark"]`). Change both blocks together.

**Audio.** `Snd.init()` / `Snd.wake()` must run inside a user gesture before any sound plays.
