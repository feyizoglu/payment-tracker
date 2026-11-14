# Hot Potato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for every task: write the failing test, watch it fail, implement, watch it pass, commit.

**Goal:** Add Hot Potato (TR Sıcak Patates), a pass-the-phone party game with a hidden fuse, to the Games section on web and mobile, offline like the other games.

**Architecture:** All rules live in the pure module `shared/hot-potato.ts`: setup defaults, validation and `parseSavedSetup`, task building from an injected pool, the fuse draw with an injected `Rng`, and a reducer (`setup → ready → playing → bang → end`) whose actions carry their time (`at`). The letter table is generated once from the Describe It lists and written out in `shared/hot-potato-letters.ts`, so the game never loads the word lists. Each platform has thin screens under `potato/`; the play screen owns the interval and the visibility / AppState listener and only asks the reducer to check the fuse.

**Tech stack:** Next.js 16 client components with Tailwind v4, Expo SDK 57 with NativeWind 4 and expo-router, vitest in the node environment (components are called as functions or rendered through react-dom into a fake container).

**Spec:** `docs/superpowers/specs/2026-11-14-hot-potato-design.md`

## Read this first

- **Worktree:** `.claude/worktrees/hot-potato`, branch `feature/hot-potato`. Other agents are writing `shared/hot-potato-prompts/tr.ts` and `en.ts` here and do not commit: never edit, stage or stash anything under `shared/hot-potato-prompts/`. Commit with explicit paths only (`git commit -m "…" -- <paths>`), and check `git diff --cached --name-only` first.
- **No test reads the real prompt lists.** The reducer takes the pool as an argument; container tests mock `@/lib/hot-potato-prompts` and `@ptracker/shared/hot-potato-prompts`.
- **Known red, not ours:** `src/lib/hot-potato-prompts.test.ts` "has enough tasks" (tr, en) until the lists are written; two tests in `src/components/CalendarView.mark-paid.test.ts`.
- **Mobile tests** are collected only from `mobile/src/lib/**/*.test.ts`.
- **Colours:** player colours are runtime hex values, always in `style`; text on them is `GAME_THEME.ink`.

## Decisions (the spec leaves them open)

1. **First starter:** drawn with the game's `Rng` at Start and again at Play again. Every later round starts with the next living seat after the seat that exploded.
2. **Task ids:** ready-made tasks keep their list id (`tr-12`); letter tasks are `<lang>:<category>:<letter>` (`tr:animals:S`). The used list is per device session and survives Play again **and** New game; a kind starts over (only its own ids are forgotten) when every task of it was used.
3. **Mixed:** each round draws the kind with equal chance; a kind with no tasks falls back to the other. Start is refused when the chosen mode has no task at all.
4. **Fuse clock:** state keeps `fuseMs`, `burntMs` and `litAt` (`null` while paused). On-screen time is `burntMs + (at - litAt)`. `pause` and `resume` are idempotent; `tick`, `pause` and `resume` skip the tap guard and do not write `lastActionAt`. A tick while paused never bangs.
5. **Pass:** tap guard first, then the fuse: a Pass at or past the fuse end bangs on the holder. A Pass swallowed by the guard leaves the holder in place, and the next tick bangs on them.
6. **Bang:** stored as `bangAt`; Next is refused until `POTATO_NEXT_LOCK_MS` (1500) after it, on top of the 250 ms tap guard, whether a tick or a Pass caused it. The out order is kept for the end screen.
7. **Language:** the pool carries its language; a task's text is built with that language's strings (`taskText(task, lang)`), so a language switch mid-game never mixes a TR letter with an EN phrase.
8. **Validation:** Imposter's error strings and limits (3–12 players); names compared lowercased with the app language's locale as Describe It does. A lives value outside 1–5 is an error of the rules step.
9. **Bang look:** the frame turns red (`PLAYER_COLORS[0]`, dark text), "BANG!", the holder's name and their lives left or "Out of the game!". The text is in a `role="alert"` `aria-live="assertive"` region on web and read out with `AccessibilityInfo` on mobile.
10. **Pulse:** `fuseStage(state, now)` returns `calm`, `pulse` (last quarter) or `fast` (last tenth). Web: an `aria-hidden` overlay with `animate-pulse`, 1 s or 0.5 s. Mobile: an RN `Animated` loop on a hidden overlay.
11. **Games list:** web uses lucide `Flame` on `bg-orange-50` (themed in dark mode in `globals.css`); mobile uses 🥔 on `bg-amber-50`, because orange is not a themed token in `mobile/tailwind.css`.

## File map

Shared: create `shared/hot-potato-letters.ts`, `shared/hot-potato.ts`; modify `shared/i18n.ts`.

Web: create `src/lib/hot-potato.ts` (re-export), `src/lib/hot-potato.test.ts`, `src/lib/hot-potato-letters.test.ts`, `src/app/games/potato/page.tsx` (+ `page.test.ts`), `src/components/games/potato/` `PotatoGame`, `PotatoSetupWizard`, `PotatoRulesStep`, `PotatoReady`, `PotatoPlay`, `PotatoBang`, `PotatoEnd` (+ `PotatoSetup.test.ts`, `PotatoScreens.test.ts`, `PotatoGame.test.ts`); modify `src/app/games/page.tsx` (+ test), `src/lib/games-offline.ts` (+ test), `public/sw.js`.

Mobile: create `mobile/src/lib/hot-potato-storage.ts` (+ test), `mobile/src/app/games/potato.tsx`, `mobile/src/components/games/potato/` `potato-setup`, `potato-rules-step`, `potato-ready`, `potato-play`, `potato-bang`, `potato-end` (+ `mobile/src/lib/potato-screen.test.ts`, `mobile/src/lib/potato-screens.test.ts`, `mobile/src/lib/potato-setup.test.ts`); modify `mobile/src/app/_layout.tsx`, `mobile/src/app/games/index.tsx`, `mobile/src/lib/root-layout.test.ts`, `mobile/src/lib/game-mode-entry.test.ts`.

## Tasks

### Task 1: Letter table

- Generate `POTATO_LETTERS` once with a throwaway script outside the repo (candidate letters from the spec, ≥ 5 words, first letters upper-cased with `tr-TR` / `en-US`), write the result into `shared/hot-potato-letters.ts` with `POTATO_CATEGORIES` and `POTATO_CANDIDATE_LETTERS`, delete the script.
- Test `src/lib/hot-potato-letters.test.ts` (imports the word lists): every pair starts at least 5 words; every letter is a candidate of its language; idioms are absent and every other category is present; no letter twice in a category.
- Commit `feat(games): add the Hot Potato letter table`.

### Task 2: Shared module and strings

- Tests first in `src/lib/hot-potato.test.ts`, with small fixture pools:
  - validation (too few, too many, blank, duplicate with the locale, lives), `stepErrors`, `parseSavedSetup` (garbage, older shapes, each field alone);
  - `drawFuse` stays in each range; `nextLiving` skips players who are out;
  - `pickTask`: letter tasks only from the pool's letters (and from `POTATO_LETTERS` through `potatoPool`), no repeat in a game, a kind restarts alone when exhausted, an empty kind falls back, mixed draws both kinds;
  - reducer: start (invalid setup, empty pool, trimmed names, random starter), light (task and fuse), Pass order skipping players who are out, the tap guard, a bang only once the fuse has run out (both sides of the boundary), a late Pass that bangs, pause and resume (idempotent, a paused tick never bangs, time off screen does not count), lives and elimination, the 1.5 s lock on Next, the next round's starter, the winner and the out order, Play again keeps the used tasks, New game keeps them too;
  - `fuseStage` boundaries; `taskText` in both languages.
- Implement `shared/hot-potato.ts`, the `src/lib/hot-potato.ts` re-export and every TR + EN string in `shared/i18n.ts`.
- Commit `feat(games): add the Hot Potato rules and strings`.

### Task 3: Web screens

- Tests first: `PotatoSetup.test.ts` (rules step choices, two-step wizard with dots, Back / Next, errors, quick start), `PotatoScreens.test.ts` (Ready names the starter; Play shows the task and the holder, Pass labelled with the holder, interval ticks, visibility pauses and resumes, pulse only in the last quarter and hidden from screen readers; Bang vibrates once where supported, announces, Next disabled until 1.5 s; End shows the winner and the out order), `PotatoGame.test.ts` (react-dom container: saved setup, start, pass, bang, next, end, play again, new game; prompts mocked), `src/app/games/potato/page.test.ts`.
- Implement the components and the page; add the Flame entry to `src/app/games/page.tsx` (+ test).
- Commit `feat(games): add the Hot Potato web screens`.

### Task 4: Offline web

- Tests first: `src/lib/games-offline.test.ts` expects five pages and `games-v4`, with a `/games/potato` fixture page.
- Add `/games/potato` to `GAMES_PAGES` in `src/lib/games-offline.ts` and `public/sw.js`; bump `GAMES_CACHE` to `games-v4` (only in `games-offline.ts`).
- Commit `feat(games): keep Hot Potato playable offline`.

### Task 5: Mobile

- Tests first: `hot-potato-storage.test.ts` (key, parse, fail-soft read and write), `potato-screen.test.ts` (route with mocked hooks: PIN gate, loading, start, play, bang, end, saved setup), `potato-screens.test.ts` (ready; play: AppState pauses and resumes, ticks, pulse; bang: vibration once, announcement, Next lock; end), `potato-setup.test.ts` (rules step and two-step wizard), root layout guard and the games list (five presses, flag at index 4).
- Implement the storage, route, components, `_layout.tsx` registration and the games list entry.
- Commit `feat(games): add Hot Potato to the mobile app`.

### Task 6: Verify

- Root `npx vitest run` (only the known reds), `cd mobile && npx vitest run`, both `npx tsc --noEmit`, `npx eslint` on every web file touched, `npm run build`, `git status --porcelain`.
