# Describe It (word game) — design

Date: 2026-11-13. The second game in the Games section, after Imposter
(`2026-11-11-imposter-game-design.md`, `2026-11-12-imposter-visuals-design.md`).

## Goal

A team word game for one phone passed around the table: the describer has a short time to get
their team to guess as many words as possible. It ships on web and mobile together, works
offline, and reuses the Imposter screens' frame, palette and colours. The rules are a common
party-game genre; the name, words and look are our own, and no existing game's look is copied.

Name: **Anlat Bul** (TR) / **Describe It** (EN). Route `/games/word` on both platforms.

## Decisions

| Topic | Decision |
|---|---|
| Teams | Always two teams, 2 to 8 players each |
| Mode | Chosen in setup: free, forbidden words, or mime |
| Scoring | Correct +1, Pass 0 with a pass limit, Foul −1 |
| End | Chosen in setup: a number of rounds, or a target score |
| Words | A new built-in list per language, about 3200 words, each easy or hard, each with 4 forbidden words |
| Repeats | Words seen on this device do not come back until the chosen set is used up |
| Not included | Own word packs, downloaded packs, sound or vibration, fixing a wrong tap afterwards |

## Setup wizard

One screen with three steps, progress dots, Back / Next, like Imposter's wizard. The settings
are remembered on the device; when a game was played before and the remembered settings pass
validation, step 1 shows **Start with last settings**.

1. **Teams.** Two team cards in the team's colour: team 1 `PLAYER_COLORS[0]`, team 2
   `PLAYER_COLORS[6]`. Each card has an editable team name (default "Team 1" / "Team 2",
   translated) and its players: a name field, a remove button and "Add player" per team.
   **Shuffle** spreads all entered names over the two teams at random, as evenly as possible.
2. **Words.** Category: Mixed or one of the categories below, each with its emoji. Difficulty:
   Easy, Hard or Mixed.
3. **Rules.**
   - Mode: Free, Forbidden words, Mime, each with a one-line rule under it.
   - Turn time: 30, 60 or 90 seconds (default 60).
   - Passes per turn: 0, 3 or unlimited (default 3).
   - End: by rounds (1, 2 or 3; default 2) or by target score (20, 30 or 50; default 30).

Validation, shown on the step it belongs to:
- each team has 2 to 8 players;
- no empty names, and no name used twice across both teams (trimmed, case-insensitive);
- team names are not empty and not the same.

## A turn

1. **Hand over.** The screen in the team's colour says "Give the phone to Ayşe (Team 1)" and
   shows the score. The describer taps **Start**; the turn timer starts.
2. **Play.** The card shows the word in large type, and under it:
   - Forbidden words mode: the 4 forbidden words;
   - Mime mode: "No talking";
   - Free mode: "Do not say the word or part of it".
   The time left is shown large; for the last 10 seconds it turns red and pulses. Three
   buttons:
   - **Correct** (+1),
   - **Pass** (0), showing the passes left; disabled when none are left, hidden when the
     limit is 0,
   - **Foul** (−1): the describer broke the mode's rule; the other team calls it.
   Every button moves to the next word at once. A tap within `WORD_TAP_GUARD_MS` (300 ms) of
   the previous one is ignored, so a double tap cannot skip a word.
3. **Time up.** At zero the card is replaced by "Time's up!". The word on screen does not
   count and goes back to the deck. Then the **turn summary**: the words of this turn with
   their result (correct, passed, foul), the turn's points, both team scores, and **Next**.
   Next goes to the next hand-over, or to the end screen when the game is over.

The timer runs on wall-clock time (`endsAt`, as in Imposter's discussion timer), so it keeps
running if the app goes to the background.

**End game** (on hand-over and summary screens) goes straight to the end screen with the
scores so far.

## Turn order and end of the game

- Team 1 starts; the teams alternate. Within a team the describer rotates in list order: a
  team's n-th turn is played by `players[n % players.length]`.
- **By rounds:** one round is one turn for every player of the larger team, so each team gets
  `rounds × max(team sizes)` turns. The game ends after team 2's last turn. Equal scores are a
  draw.
- **By target:** after each pair of turns (team 2's turn ends), the game ends when a team has
  reached the target and the scores differ. Equal scores at or above the target play another
  pair.
- **End screen:** winner (or draw) in the winner's colour, both scores, and **Play again**
  (same settings, back to the first hand-over) and **New game** (back to setup).

## Words

### Content

- Separate lists per language, so Turkish can have its own words and idioms; the categories
  are shared. Words follow the app language at game start, as in Imposter.
- Categories (13): animals, food, jobs, places, objects, sports, home, nature, body, transport,
  arts, actions, idioms. The first six reuse Imposter's labels and emoji.
- Each category has at least 220 words per language, with at least 90 easy and 90 hard ones:
  about 3200 words per language. Rows are only ever appended, so ids stay stable.
- Each word has exactly 4 forbidden words: the words a describer would reach for first.
- Easy: an everyday word a child knows. Hard: rarer, abstract, or hard to describe without
  the obvious words.
- Family friendly. No brand names, no real people, no titles of films, books or songs.

### Files and shape

- `shared/word-game-words/<lang>/<category>.ts`, one file per language and category, each
  exporting a `WordCard[]`; `shared/word-game-words/index.ts` gathers them into
  `WORD_GAME_WORDS: Record<Lang, Record<WordCategory, WordCard[]>>`.
- `WordCard = { id: string; word: string; forbidden: [string, string, string, string]; level: "easy" | "hard" }`.
  `id` is `<category>-<n>`, unique within a language and never reused for another word.

### Checks (unit tests on the lists)

- ids and words unique within a language (words compared trimmed and lowercased with the
  language's locale);
- exactly 4 forbidden words, none empty, no duplicates among them;
- no forbidden word contains the word and the word contains no forbidden word (same
  normalisation);
- level is easy or hard; the per-category minimums above hold for both languages.

### Deck and repeats

- At game start the deck is every word of the chosen language, category and difficulty that
  is not in the device's **seen list**, shuffled. When fewer than 50 unseen words are left,
  the seen list is cleared for that category and difficulty, and the deck is the unseen words
  shuffled, followed by the words that were seen, shuffled: words seen recently still come
  last.
- A word is added to the seen list when it is shown in a turn. The seen list is saved at the
  end of every turn: one list per language, stored like Imposter's settings (web
  `localStorage`, mobile `AsyncStorage`, fail-soft).
- If the deck runs out during a game, every word shown in earlier turns of this game is
  shuffled back in (not the words of the turn being played), so the game always reaches its
  end rule and both teams get their turns; some words may repeat. A word passed when the deck
  is empty goes to the end of the refilled deck, never straight back. Only when nothing can
  be shuffled back in (the pool is smaller than one turn) does the turn end, and the game ends
  with a "No words left" note on the end screen.
- Name checks in setup (repeated player names, equal team names) compare names lowercased
  with the app language's locale, so Turkish İ/ı are handled the same on every device.

## Code structure

- `shared/word-game.ts`: types, setup defaults and validation, `parseSavedSetup`, `buildDeck`,
  `teamColor`, and a pure `wordGameReducer` with phases `setup → handoff → play → summary →
  end`. Actions carry their time (`at`), and `start` carries the language, the deck source and
  an `Rng`, as in Imposter's reducer. Countdown helpers are imported from `shared/imposter.ts`.
- `shared/word-game-words/`: the lists above.
- `shared/i18n.ts`: all strings in TR and EN.
- Web: `src/app/games/word/page.tsx` in `GamesShell`; components in
  `src/components/games/word/` (`WordGame`, `WordSetupWizard` and its three steps,
  `WordHandoff`, `WordTurn`, `WordSummary`, `WordEnd`) inside `GameFrame`, with a new entry on
  `src/app/games/page.tsx`. `src/lib/word-game.ts` re-exports the shared module.
- Mobile: `mobile/src/app/games/word.tsx` with `useEnterGameModeOnce` / `GamesPinSetup` like
  `imposter.tsx`; components in `mobile/src/components/games/word/` in `GameScreen` with
  `tone="game"`; a new entry on `mobile/src/app/games/index.tsx`;
  `mobile/src/lib/word-game-storage.ts` for setup and seen list.
- Offline web: `/games/word` added to `GAMES_PAGES` in `src/lib/games-offline.ts` and
  `public/sw.js`, and `GAMES_CACHE` bumped to `games-v2` in both.
- Imposter's code is not changed.

## Accessibility

- Every button has a role and a label; Pass reads the passes left.
- The time left is announced at 10 seconds and at time up, not every second.
- Team colours are never the only signal: team names are always written next to them.

## Testing

- Reducer, deck, validation, turn order, both end rules, draws, deck exhaustion and the tap
  guard: unit tests in `src/lib/word-game.test.ts`.
- Word lists: the checks above in `src/lib/word-game-words.test.ts`.
- Screens on both platforms with the existing component test harness (web
  `src/components/games/word/*.test.ts`, mobile `mobile/src/lib/word-*.test.ts`).
- Before the owner's device check: web build, the single-React bundle check, and the adb
  launch check when the phone is attached.

## Delivery

- Branch `feature/word-game`, from `feature/imposter-visuals` (it uses that branch's game
  frame, palette and `GameScreen` slots), in the worktree `.claude/worktrees/word-game`. Its PR
  targets `main` once PR #12 is merged.
- Code is written task by task by one implementer agent with reviews; the word lists are
  written by one agent per category, in parallel.
- Pushing, opening the PR, publishing to the phone and merging each need the owner's OK.
- Mobile ships as an `eas update`: no native module is added.
