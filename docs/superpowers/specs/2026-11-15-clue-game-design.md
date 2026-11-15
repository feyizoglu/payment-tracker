# One Clue — design

Date: 2026-11-15. A cooperative word game for the Games section, built together with Scale
(`2026-11-15-scale-game-design.md`) and shipped in the same pull request.

## Goal

One player, the guesser, must find a secret word. Every other player sees the word and writes a
single one-word clue without seeing the others' clues. Clues that two or more players wrote are
removed before the guesser sees them, so the table has to be original, not obvious. Everyone plays
on the same side; the goal is to guess as many words of the deck as possible. It is played on one
phone passed around, offline, on web and mobile, and reuses the other games' frame, palette,
colours and players step, and the Describe It word lists. Cooperative clue-giving with
duplicate-cancelling is a party-game genre; the name, texts and look are our own.

Name: **Tek İpucu** (TR) / **One Clue** (EN). Route `/games/clue` on both platforms.

The owner approved the idea and asked to go as far as possible without check-ins; the decisions
below were made by the lead and can be changed later.

## Setup wizard

Two steps with progress dots and Back / Next. Settings are remembered on the device; **Start with
last settings** on step 1 when they are valid.

1. **Players.** Imposter's players step: 3 to 10 players.
2. **Rules.**
   - Deck: 8, 13 or 20 words (default 13).
   - Words: Easy, Hard or Mixed (default Mixed).

## Words

- The Describe It lists in the app's language (`shared/word-game-words`), all categories except
  idioms (a clue for a phrase is rarely one word). Easy / Hard / Mixed filter by the Describe It
  level.
- Words seen on this device are dealt last, as in Describe It, with this game's own seen list per
  language; when fewer than the deck size are unseen, the seen list for the chosen pool is cleared.
- The Describe It forbidden words are not used.

## A round

The guesser rotates through the players in seat order, one word each.

1. **Handoff to the clue givers.** "Ayşe guesses this round. Ayşe, don't look — give the phone to
   Burak." The word is not shown.
2. **Clue, once per clue giver**, in seat order after the guesser:
   - "Burak, only you look." **Show the word** reveals the word.
   - One text field for one clue: trimmed, no spaces allowed, at most 24 characters.
   - **Done** hides the word and says "Give the phone to Cem". The next clue giver taps their
     own **Show the word**.
3. **Check.** Shown to the clue givers, never to the guesser ("Ayşe, don't look"):
   - The word and every clue with its writer.
   - Clues that match another clue are struck out automatically. Matching ignores case (with the
     language's locale), accents and punctuation.
   - A clue that is the word is struck out too, and so is one that contains the word or is
     contained in it, when the part inside has at least 4 letters or digits ("kedicik" for
     "kedi"). A shorter part inside is often another word ("uzay" for "ay", "hear" for "ear"):
     those are left to the table.
   - Any clue can be struck or restored by tapping it, for near-duplicates such as plural forms or
     the same word family; the table decides.
   - **Show Ayşe the clues**.
4. **Guess.** "Give the phone to Ayşe." Then the surviving clues, large, without the word or the
   writers. Ayşe says a guess out loud.
   - If no clue survived, the screen says so and the round can only be passed.
   - The table taps **Got it** (+1), **Missed** or **Pass**. Missed and Pass both score 0.
   - Then the word is shown to everyone.
5. **Next** goes to the next round's handoff.

A tap within 400 ms of the previous one is ignored.

**End:** after the deck, the score ("9 of 13"), a short rating line, the list of words with
got/missed/passed, **Play again** (same players and rules, new words) and **New game** (setup).

## Code structure

- `shared/clue-game.ts`: setup, validation, `parseSavedSetup`, deck building (words passed in),
  clue normalisation and automatic striking, a pure reducer with phases
  `setup → handoff → clue → check → guess → result → end`. Actions carry `at`; random choices take
  an `Rng`.
- `shared/i18n.ts`: all strings in TR and EN.
- Web: `src/app/games/clue/page.tsx` in `GamesShell`; components in `src/components/games/clue/`
  inside `GameFrame`, reusing `SetupPlayersStep`; a new entry on `src/app/games/page.tsx`;
  `src/lib/clue-game.ts` re-exports. The word lists load only with this game's page.
- Mobile: `mobile/src/app/games/clue.tsx` with `useEnterGameModeOnce` / `GamesPinSetup`;
  components in `mobile/src/components/games/clue/` in `GameScreen` with `tone="game"`; RN core
  `TextInput`; a new entry on `mobile/src/app/games/index.tsx`; the route inside the games guard
  in `mobile/src/app/_layout.tsx`; `mobile/src/lib/clue-game-storage.ts`.
- Offline web: `/games/clue` in `GAMES_PAGES` (both files) and the cache bump, coordinated with
  Scale in the combined branch.

## Privacy

Every screen that shows the word or the clues is preceded by a screen that names who may look,
and shows nothing secret itself. The guesser's screen never shows the word until the result.

## Accessibility

- The clue field has a label; struck clues are announced as struck, not only drawn crossed out.
- Results are written, never shown by colour alone.

## Testing

- `src/lib/clue-game.test.ts`: validation, the guesser rotation, the clue-giver order, clue
  validation (empty, spaces, length), normalisation and automatic striking (duplicates, the word
  inside a clue and a clue inside the word, Turkish İ/ı), manual strike and restore, the
  no-clue round, scoring, the tap guard, the seen list and its reset, end, Play again and New game.
- Screens on both platforms with the existing component test harness, including that no screen
  before the result shows the word to the guesser.
