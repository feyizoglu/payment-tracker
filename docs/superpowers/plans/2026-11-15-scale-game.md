# Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every task: write the failing test, watch it fail, implement, watch it pass, commit.

**Goal:** Add Scale (TR Ölçek), a team game of guessing a hidden point between two opposites, to the Games section on web and mobile, offline like the other games.

**Architecture:** All rules live in the pure module `shared/scale-game.ts`: setup defaults, validation, `parseSavedScaleSetup`, the scoring bands, the needle geometry and a reducer (`setup → handoff → secret → guess → reveal → end`) whose actions carry their time (`at`) and whose randomness comes from an injected `Rng`. The pair list is passed into `start`; the module imports only `shared/scale-pairs/types.ts`. Only the game containers (web `ScaleGame`, mobile `app/games/scale.tsx`) import `SCALE_PAIRS`, so the lists ship with the game's route and nothing else.

**Tech stack:** Next.js 16 client components with Tailwind v4, Expo SDK 57 (React Native 0.86) with NativeWind 4 and expo-router, vitest in the node environment (components are called as functions or rendered through react-dom into a fake container).

**Spec:** `docs/superpowers/specs/2026-11-15-scale-game-design.md`

## Read this first

- **Worktree:** `.claude/worktrees/scale-game`, branch `feature/scale-game`. Other agents are writing `shared/scale-pairs/tr.ts` and `en.ts` and do not commit. Never edit, stage or stash anything under `shared/scale-pairs/`. Commit with explicit paths only (`git commit -m "…" -- <paths>`), and check `git diff --cached --name-only` first.
- **No test reads the real pair lists.** The reducer takes the list as an argument; container tests mock `@/lib/scale-pairs` and `@ptracker/shared/scale-pairs` with a few fixture pairs.
- **Known red, not ours:** `src/lib/scale-pairs.test.ts` "has enough pairs" until the lists are filled; two tests in `src/components/CalendarView.mark-paid.test.ts`.
- **Mobile tests** are collected only from `mobile/src/lib/**/*.test.ts`.
- **Colours:** team colours are runtime hex values, always in `style`; text on them is `GAME_THEME.ink`.

## Decisions (the spec leaves them open)

1. **Setup shape:** `{ teams: [WordTeam, WordTeam], turns }`, turns per team 4, 6 or 8 (default 6). Validation is Describe It's team rules and strings (2–8 players each, blank and duplicate names, blank and equal team names) plus `rules` when `turns` is not a choice. Steps: `teams`, `rules`. `parseSavedScaleSetup(raw, teamNames)` keeps each field only if valid on its own. Stored under `scale_setup`.
2. **Turn order:** team `turnsPlayed % 2`, `2 × turns` turns. `clueGivers: [number, number]` counts each team's finished turns since the setup; the clue giver is `players[clueGivers[team] % players.length]`. It advances on Next, carries into Play again and resets on New game (the teams may change there).
3. **Pairs:** drawn on Show target, at random from the pairs not in `used`; the drawn id joins `used`. When none is left, the list's ids leave `used` and the draw is from the whole list except the pair just played. `used` carries into Play again and New game, in memory only; ids carry their language, so another language's list is unaffected. Start is refused with an empty list.
4. **Target:** an integer 3–97, `3 + min(94, floor(rng() × 95))`, drawn right after the pair.
5. **Needle:** an integer 0–100, 50 when the guess opens. `move` sets it (rounded and clamped); ◀ ▶ dispatch `move` with ±1. Moves skip the tap guard and do not stamp `lastActionAt` (a drag sends many, and ◀ ▶ may be tapped fast), but one within 400 ms of the last button tap is ignored. A move cancels a pending confirm.
6. **Lock in:** the first tap sets `confirming`; the second, at least 400 ms later, locks the needle: points are added to the team, the phase is `reveal` and `revealedAt` is the tap's time. Next is refused for `SCALE_REVEAL_LOCK_MS` (1000) after it, and for 400 ms after any tap.
7. **Scoring:** one table, `SCALE_BANDS = [{ within: 3, points: 4 }, { within: 8, points: 3 }, { within: 14, points: 2 }]`, distance `|needle − target|`, else 0. `scaleZones(target)` draws the same table: each zone spans `target ± (within + 0.5)` clipped to 0–100, so the edge values sit inside it. The reveal line comes from the points: 4 bullseye, 3 very close, 2 close, 0 missed, with the distance written.
8. **End:** the higher score wins, equal scores are a tie. Play again keeps the setup, the givers and `used`; New game returns to the wizard with the last setup.
9. **Geometry:** `needleAt(offset, width)` turns a pointer offset along the track into a needle value; web takes it from `getBoundingClientRect` (stateless, with pointer capture), mobile from PanResponder's `locationX` at grant plus `dx`, with the track's children `pointerEvents="none"` so `locationX` is the track's.
10. **Web language:** as Who Am I?, until a setup is saved the default team names follow the page's language (`scaleSetupInLang`).
11. **Games list:** web lucide `Gauge` on `bg-sky-50`, icon `text-sky-600 dark:text-sky-400`, `hover:border-sky-200` (`--color-sky-50` and `--color-sky-200` in `.dark`); mobile 🎯 on `bg-sky-50`, themed in `tailwind.config.js`, `tailwind.css` (light and dark) and `game-theme.ts`.

## File map

Shared: create `shared/scale-game.ts`; modify `shared/i18n.ts`.

Web: create `src/lib/scale-game.ts` (re-export), `src/lib/scale-game.test.ts`, `src/app/games/scale/page.tsx` (+ `page.test.ts`), `src/components/games/scale/` `ScaleGame`, `ScaleSetupWizard`, `ScaleTeamsStep`, `ScaleRulesStep`, `ScaleHandoff`, `ScaleSecret`, `ScaleGuess`, `ScaleReveal`, `ScaleEnd`, `ScaleTrack` (the line with its labels, zones and needle), `ScaleNeedle` (the slider) (+ `ScaleSetup.test.ts`, `ScaleScreens.test.ts`, `ScaleGame.test.ts`); modify `src/app/games/page.tsx` (+ test), `src/app/globals.css`, `src/lib/games-offline.ts` (+ test), `public/sw.js`.

Mobile: create `mobile/src/lib/scale-game-storage.ts` (+ test), `mobile/src/app/games/scale.tsx`, `mobile/src/components/games/scale/` `scale-setup`, `scale-teams-step`, `scale-rules-step`, `scale-handoff`, `scale-secret`, `scale-guess`, `scale-reveal`, `scale-end`, `scale-track`, `scale-needle` (+ `mobile/src/lib/scale-screen.test.ts`, `scale-screens.test.ts`, `scale-setup.test.ts`); modify `mobile/src/app/_layout.tsx`, `mobile/src/app/games/index.tsx`, `mobile/tailwind.config.js`, `mobile/tailwind.css`, `mobile/src/lib/game-theme.ts`, `mobile/src/lib/root-layout.test.ts`, `mobile/src/lib/game-mode-entry.test.ts`.

## Tasks

### Task 1: Rules and strings

- Tests first in `src/lib/scale-game.test.ts`, with a three-pair fixture:
  - defaults; validation (team sizes 2 and 8, blank and duplicate names with the locale, team names, turns), `scaleStepErrors`; `parseSavedScaleSetup` (garbage, older shapes, each field alone); `scaleSetupInLang`;
  - `scalePoints` at 3/4, 8/9, 14/15 and 0; `scaleZones` for a middle target and clipped at 3 and 97; `needleAt` clamps and rounds; `drawTarget` at rng 0 and just under 1;
  - reducer: start (invalid setup, empty list, trimmed names), the turn order and the giver rotation over both teams and Play again, show draws a pair and a target, hide opens the needle at 50, moves (clamp, guard window, no stamp, cancel the confirm), the confirm step (a fast second tap is ignored), points added to the team on turn, the reveal lock on both sides of 1000 ms, no repeated pair, exhaustion mid-game without the pair just played, `used` into Play again and New game, the end after `2 × turns`, winner and tie, the tap guard on every button.
- Implement `shared/scale-game.ts`, `src/lib/scale-game.ts` and every TR + EN string in `shared/i18n.ts`.
- Commit `feat(games): add the Scale rules and strings`.

### Task 2: Web screens

- Tests first: `ScaleSetup.test.ts` (teams adapter, turns choice, two-step wizard with dots, Back / Next, errors per step, quick start), `ScaleScreens.test.ts` (handoff names the team and the giver; secret shows the pair and the zones with their points written; needle: `role="slider"` with aria values, arrow / Home / End / Page keys, pointer down and drag through capture, ◀ ▶ at the ends; guess: Lock in and its confirm label; reveal: zones, needle, points, distance and line, Next disabled until the lock ends; end: winner or tie and both buttons), `ScaleGame.test.ts` (react-dom container with mocked screens and pairs: saved setup, language follow, start saves, a whole turn, givers, end, Play again, New game), `src/app/games/scale/page.test.ts`.
- Implement the components and the page; add the entry to `src/app/games/page.tsx` (+ test) and the sky tones to `globals.css`.
- Commit `feat(games): add the Scale web screens`.

### Task 3: Offline web

- Tests first: `src/lib/games-offline.test.ts` expects seven pages and `games-v6`, with a `/games/scale` fixture page.
- Add `/games/scale` to `GAMES_PAGES` in `src/lib/games-offline.ts` and `public/sw.js`; bump `GAMES_CACHE` to `games-v6` (only in `games-offline.ts`).
- Commit `feat(games): keep Scale playable offline`.

### Task 4: Mobile

- Tests first: `scale-game-storage.test.ts` (key, parse, fail-soft reads and writes), `scale-screen.test.ts` (route with mocked hooks: PIN gate, loading, start, a whole turn, end, header and scroll per phase), `scale-screens.test.ts` (handoff, secret, needle: PanResponder grant and move, adjustable actions, ◀ ▶; guess, reveal lock, end), `scale-setup.test.ts` (steps and wizard), root layout guard, the games list (seven presses, Scale at 5, the flag at 6) and the game theme tokens.
- Implement the storage, route, components, `_layout.tsx` registration, the games list entry and the sky tone.
- Commit `feat(games): add Scale to the mobile app`.

### Task 5: Verify

- Root `npx vitest run` (only the known reds), `cd mobile && npx vitest run`, both `npx tsc --noEmit`, `npx eslint` on every web and shared file touched, `npm run build`, and the bundle check: a chunk holding a pair string is named by the `/games/scale` HTML and by no other page's. Mutation-check the key rules (break, see a test fail, revert). `git status --porcelain` shows only the two pair files.
