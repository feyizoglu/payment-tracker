# Secret Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Secret Word (spec `docs/superpowers/specs/2026-11-19-secret-word-design.md`) on web and mobile, offline.

**Architecture:** A pure engine in `shared/secret-word.ts` (words, letters, marks, rounds, page lines,
palette). Web renders it with DOM elements in `src/components/games/secret/`; mobile with plain
`View`s in `mobile/src/components/games/secret/`. No frame loop, canvas or Reanimated: the game is
turn-based. Best streak through `shared/best-score.ts`; seen words per language.

**Tech Stack:** Next.js (web), Expo SDK 57 + NativeWind (mobile), Vitest.

---

### Task 1: Engine

**Files:** Create `shared/secret-word.ts`, `src/lib/secret-word.ts` (re-export), `src/lib/secret-word.test.ts`.

- [ ] Write tests: `secretUpper`/`secretLetter` (Turkish i→İ, ı→I, other alphabets refused), keyboard rows cover each alphabet once, every answer five letters of its alphabet with unique words and ids, `pickSecret` unseen first and starting over without the last word, `markGuess` with repeated letters (KÖPEK, TİLKİ, SÜLÜK), `keyMarks` only improving, typing/deleting/short Enter/win/loss, `secretOpen`, `secretLines`.
- [ ] Run `npx vitest run src/lib/secret-word.test.ts`: fails (module missing).
- [ ] Implement the engine.
- [ ] Run again: passes.

### Task 2: Texts

**Files:** Modify `shared/i18n.ts`.

- [ ] Add `secretTitle`, `secretDesc`, `secretHint`, `secretStreak`, `secretShort`, `secretWon`, `secretLost`, `secretNext`, `secretEnter`, `secretDelete`, `secretKeyHint`, `secretLegendHit`, `secretLegendNear`, `secretLegendMiss` after the Book Tower keys in `en` and `tr`.

### Task 3: Web game

**Files:** Create `src/components/games/secret/SecretParts.tsx`, `SecretGame.tsx`, `SecretGame.test.ts`, `src/app/games/secret/page.tsx`, `page.test.ts`.

- [ ] Tests (react-dom client harness as in `TowerGame.test.ts`, `Math.random` 0 and a fake `Date.now`): hint and seen list on deal, on-screen keys and delete, physical keys with modifiers and fields ignored, marks on page and keys, win raising the streak and saving the best, 400 ms guard on Next word, Enter on the panel, loss resetting the streak, unreadable storage claiming no best.
- [ ] Implement; on-screen keys keep focus off (`onMouseDown` preventDefault) so the physical Space/Enter never re-press them.
- [ ] Run `npx vitest run src/components/games/secret src/app/games/secret`: passes.

### Task 4: Web wiring

**Files:** Modify `src/app/games/page.tsx` (+ test), `src/lib/games-offline.ts` (+ test), `public/sw.js`, `src/app/globals.css`.

- [ ] Card after Book Tower: lucide `SpellCheck`, indigo-50 tile, indigo-200 hover.
- [ ] `/games/secret` in both `GAMES_PAGES`, cache `games-v9`; dark `--color-indigo-200`.
- [ ] Run the list and offline tests: pass.

### Task 5: Mobile

**Files:** Create `mobile/src/lib/secret-word-storage.ts` (+ test), `mobile/src/components/games/secret/secret-parts.tsx`, `mobile/src/app/games/secret.tsx`, `mobile/src/lib/secret-screen.test.ts`, `mobile/src/lib/secret-parts.test.ts`. Modify `mobile/src/app/games/index.tsx`, `mobile/src/app/_layout.tsx`, `mobile/tailwind.config.js`, `mobile/tailwind.css`, `mobile/src/lib/game-theme.ts`, `mobile/src/lib/game-mode-entry.test.ts`, `mobile/src/lib/root-layout.test.ts`.

- [ ] Storage: best via `best-storage.ts`, seen lists fail-soft to `[]`.
- [ ] Screen reads the best and both seen lists once, deals only after they settle; `confirmBack`/`nav` from `secretOpen`; best checked after each win with `bestAfter(streak, session, null)`.
- [ ] Card 🔤 on `bg-indigo-50` (themed in config, CSS and `GAME_DARK_TOKENS`); register `games/secret`.
- [ ] Regenerate typed routes: `CI=1 npx expo start --offline --port 8099`, stop once `.expo/types/router.d.ts` lists `/games/secret`.
- [ ] Run `cd mobile && npx tsc --noEmit && npx vitest run`: passes.

### Task 6: Check and ship

- [ ] `npx tsc --noEmit`, `npx eslint`, full web and mobile suites.
- [ ] Browser pass at 360 px in both languages through a throwaway page (not committed).
- [ ] Roadmap line; push through `/push-gate:push`, PR, CI, merge, `eas update --channel preview`.
