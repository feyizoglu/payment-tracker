# Scale — design

Date: 2026-11-15. A team game for the Games section, built together with One Clue
(`2026-11-15-clue-game-design.md`) and shipped in the same pull request.

## Goal

The screen shows a line between two opposites ("Cheap ←→ Expensive"). One player, the clue giver,
secretly sees a target point on that line and says one clue out loud ("a bagel"). Their team
moves a needle to where they think the target is; the closer, the more points. It is played on
one phone, offline, on web and mobile, and reuses the other games' frame, palette, colours and
Describe It's teams step. Guessing a hidden point on a spectrum is a party-game genre; the name,
texts, scoring details and look are our own.

Name: **Ölçek** (TR) / **Scale** (EN). Route `/games/scale` on both platforms.

The owner approved the idea and asked to go as far as possible without check-ins; the decisions
below were made by the lead and can be changed later.

## Setup wizard

Two steps with progress dots and Back / Next, like Describe It. Settings are remembered on the
device; **Start with last settings** on step 1 when they are valid.

1. **Teams.** Describe It's teams step: two teams, team names, 2 to 8 players each.
2. **Rules.** Turns per team: 4, 6 or 8 (default 6).

## A turn

Teams alternate; within a team the clue giver rotates turn by turn.

1. **Handoff.** "Red team — Ayşe gives the clue. Only Ayşe looks at the screen." **Show target**.
2. **Secret.** The pair ("Cheap ←→ Expensive") and the target, drawn as a scoring band centred on
   a hidden position from 3 to 97, drawn with the game's `Rng`. **Hide and give the clue** hides
   the target.
3. **Guess.** The pair and a needle in the middle. The team drags or taps the needle (and can
   nudge it with ◀ ▶ buttons by 1), talking freely; the clue giver may not add clues.
   **Lock in** asks for a second tap to confirm.
4. **Reveal.** The target band appears with the needle. Points by distance between needle and
   target (0–100 scale): ≤ 3 → 4 points, ≤ 8 → 3, ≤ 14 → 2, otherwise 0. A short line says how
   close they were. **Next** goes to the other team's handoff.

The scoring band on the secret and reveal screens shows the three zones (4, 3, 2) so the table
can see why they scored.

A tap within 400 ms of the previous one is ignored. After the reveal appears, **Next** works only
after 1 s, so the confirm tap cannot skip it.

**End:** after every team has played its turns, the scores, the winner or a tie, **Play again**
(same setup) and **New game** (setup).

## Pairs

- Files `shared/scale-pairs/tr.ts` and `en.ts`, each an append-only list of `[left, right]` rows,
  written separately for each language (not translated). A pair's id is `<lang>-<n>`.
- At least 200 pairs per language. Each side at most 24 characters, no full stop, starts with a
  capital letter; TR without circumflexes. No pair repeated (either order).
- Good pairs are clear opposites with a wide middle that many things fall along: "Cold / Hot",
  "Boring / Exciting", "Easy to spell / Hard to spell", "Bad superpower / Good superpower",
  "Underrated / Overrated", "Smells bad / Smells good".
- Family friendly; no politics, religion or real people.
- A pair is not repeated until every pair of the language has been played. The device remembers
  the pairs played per language (`scale_seen_<lang>`, web localStorage and mobile storage,
  fail-soft), saved when the needle is locked and at the end, so Play again and later games carry
  on from it; when every pair has been played, that language's list starts over without the pair
  just played. Pairs are drawn at random with the game's `Rng`.

## Code structure

- `shared/scale-pairs/`: `types.ts` (`pairs()` id helper), `tr.ts`, `en.ts`, `index.ts`.
- `shared/scale-game.ts`: setup, validation, `parseSavedSetup`, scoring, a pure reducer with
  phases `setup → handoff → secret → guess → reveal → end`. Actions carry `at`; random choices
  take an `Rng`; the pair list is passed in.
- `shared/i18n.ts`: all strings in TR and EN.
- Web: `src/app/games/scale/page.tsx` in `GamesShell`; components in `src/components/games/scale/`
  inside `GameFrame`; the needle is a slider with pointer drag, tap and ◀ ▶; a new entry on
  `src/app/games/page.tsx`; `src/lib/scale-game.ts` re-exports.
- Mobile: `mobile/src/app/games/scale.tsx` with `useEnterGameModeOnce` / `GamesPinSetup`;
  components in `mobile/src/components/games/scale/` in `GameScreen` with `tone="game"`; the
  needle uses RN core `PanResponder` plus tap and ◀ ▶ (no new native module); a new entry on
  `mobile/src/app/games/index.tsx`; the route inside the games guard in
  `mobile/src/app/_layout.tsx`; `mobile/src/lib/scale-game-storage.ts`.
- Offline web: `/games/scale` in `GAMES_PAGES` (both files) and the cache bump, coordinated with
  One Clue in the combined branch.

## Accessibility

- The needle is an adjustable control (web `role="slider"` with `aria-valuenow`; mobile
  `accessibilityRole="adjustable"` with increment / decrement actions).
- Points and distances are written, never shown by colour alone.

## Testing

- `src/lib/scale-game.test.ts`: validation, turn order and clue-giver rotation, target drawn in
  3–97, scoring bands at their edges, the confirm step, the tap guard, the reveal lock, no repeated
  pair and the carry-over into Play again, end and ties.
- `src/lib/scale-pairs.test.ts`: at least 200 pairs per language, ids in order, length, capital,
  no full stop, no circumflex in TR, no repeated pair in either order.
- Screens on both platforms with the existing component test harness.
