# Hot Potato — design

Date: 2026-11-14. The fourth game in the Games section, after Imposter, Describe It
(`2026-11-13-word-game-design.md`) and Wolf Night (`2026-11-13-wolf-game-design.md`).

## Goal

A fast pass-the-phone game: the screen shows a task ("an animal starting with S"), the player
holding the phone says a fitting answer and passes it on, and a hidden fuse goes off at a random
moment. Whoever holds the phone then loses a life. It ships on web and mobile together, works
offline, and reuses the other games' frame, palette, colours and players step. The rules are a
common party-game genre; the name, texts and look are our own, and no existing game's look is
copied.

Name: **Sıcak Patates** (TR) / **Hot Potato** (EN). Route `/games/potato` on both platforms.

## Decisions

| Topic | Decision |
|---|---|
| Players | 3 to 12, each with their own colour as in Imposter |
| Tasks | Mixed by default: letter + category tasks and ready-made tasks; either can be chosen alone |
| Losing | Lives (1–5, default 3); a player with no life left is out; the last player left wins |
| Fuse | Hidden and random each round, in a range chosen in setup |
| Feedback | Vibration (React Native `Vibration`, web `navigator.vibrate` where it exists) and a full-screen explosion; no sound, no new native module |
| Not included | Sound, a challenge button, teams, scores across games |

## Setup wizard

Two steps with progress dots and Back / Next, like the other games. Settings are remembered on
the device; **Start with last settings** on step 1 when they are valid.

1. **Players.** Imposter's players step (`SetupPlayersStep`): 3 to 12 players, no empty or
   repeated names (compared lowercased with the app language's locale).
2. **Rules.**
   - Lives: 1 to 5 (default 3).
   - Fuse: Short (10–30 s), Normal (20–60 s, default) or Long (40–90 s).
   - Tasks: Mixed (default), Letters only, Ready-made only.

## A round

1. **Ready.** The screen, in the colour of the player who starts, says "Ayşe starts" and shows
   a **Start** button. The task is not shown yet.
2. **Playing.** Start reveals the task and lights the fuse.
   - The screen shows the task in large type and the holder's name, on the holder's colour.
   - The holder says an answer and taps the big **Pass** button. The phone goes to the next
     living player in seat order; the screen switches to their name and colour.
   - The task stays the same for the whole round; everyone must say something different. The
     table judges answers, not the app.
   - A tap within `POTATO_TAP_GUARD_MS` (250 ms) of the previous one is ignored.
   - In the last quarter of the fuse the screen starts to pulse, faster in the last tenth. It
     never shows the time left.
3. **Bang.** When the fuse runs out, the phone vibrates and a full-screen "BANG!" names the
   holder and shows their lives left (or "out!"). Its **Next** button works only after 1.5 s, so
   a frantic Pass tap cannot skip it.
4. The next round starts with the living player after the one who exploded, with a new task.

The fuse runs on time measured only while the game is on screen: when the app or page goes to
the background the fuse pauses, and it resumes when it comes back, so nobody explodes while the
phone is locked. The fuse for a round is drawn at Start from the setup's range with the game's
`Rng`.

The screen's timer only asks the reducer to check the fuse; the reducer decides. A Pass whose
time is at or past the fuse's end bangs on the current holder instead of passing, so a timer
that fires late never lets the holder escape.

**End:** when one player is left, the end screen shows the winner in their colour, the order
the others went out in, **Play again** (same players and rules) and **New game** (setup).

## Tasks

### Letter + category

- Each Describe It category except idioms has its own task sentence in both languages, with the
  letter as its only gap.
- Animals, food, jobs, places, objects and actions ask for the thing itself: "S ile başlayan bir
  hayvan" / "An animal starting with S", and likewise a food or drink, a job, a place, an object,
  an action (verb).
- Sports, home, nature, body, transport and arts hold too few things per letter ("a vehicle
  starting with Ş" has one or two answers), so they ask for any word on the topic: "N ile
  başlayan, vücutla ilgili bir kelime" / "A word about the body starting with N", and likewise
  sports or games, the home, nature, transport, the arts.
- Candidate letters per language:
  - TR: A B C Ç D E F G H I İ K L M N O Ö P R S Ş T U Ü V Y Z (no Ğ, J).
  - EN: A B C D E F G H I J K L M N O P R S T U V W Y (no Q, X, Z).
- Not every letter suits every category. Each category uses only the candidate letters that
  start at least 5 words of that category in the language's Describe It list. For the six
  categories that ask for the thing itself, every letter is also checked by hand: at least 4
  words of the list really are one (a real animal, a real verb), and a letter that fails is
  taken out of the table. The table (`POTATO_LETTERS`, per language and category) is written in
  the code, so the game does not load the word lists; a test checks every pair in the table
  against the lists, so the table can only shrink below what the ≥ 5 rule allows. First letters
  are compared with the language's locale, so TR I and İ stay different letters. The hand check
  of 2026-11-14 took no letter out: TR has 205 pairs, EN 202.
- A letter and category pair is not repeated within a game.

### Ready-made

- Files `shared/hot-potato-prompts/tr.ts` and `en.ts`, each an append-only list of tasks. A
  task's id is `<lang>-<n>`, from its position, so rows are only ever appended.
- At least 250 tasks per language, written separately for each language. Each one has many
  possible answers, so a whole table can answer it ("Something you take on holiday", "A word
  that rhymes with 'cat'", "A country in Europe").
- Family friendly. No brand names, and no task that asks for a real person or a title of a
  film, book, song or game.
- Each task has at least about 20 common answers; no small closed sets (seasons, continents,
  days of the week).
- One line, at most 60 characters, no full stop at the end. TR is written without circumflexes.
- A task is not repeated within a game.

### Mixed

Each round is a letter task or a ready-made one with equal chance.

### Repeats

The tasks used so far are kept for **Play again** too. When every task of a kind has been used,
that kind starts over. The longest game (12 players, 5 lives) has at most 59 rounds, fewer than
either kind holds.

## Code structure

- `shared/hot-potato.ts`: types, setup defaults and validation, `parseSavedSetup`, task
  building, and a pure reducer with phases `setup → ready → playing → bang → end`. Actions carry
  their time (`at`), random choices take an `Rng`, as in the other games.
- `shared/hot-potato-prompts/`: the two task lists and an index.
- `shared/i18n.ts`: all strings in TR and EN, including the category phrases.
- Web: `src/app/games/potato/page.tsx` in `GamesShell`; components in
  `src/components/games/potato/` inside `GameFrame`, reusing `SetupPlayersStep`; a new entry on
  `src/app/games/page.tsx`; `src/lib/hot-potato.ts` re-exports the shared module.
- Mobile: `mobile/src/app/games/potato.tsx` with `useEnterGameModeOnce` / `GamesPinSetup`;
  components in `mobile/src/components/games/potato/` in `GameScreen` with `tone="game"`; a new
  entry on `mobile/src/app/games/index.tsx`; the route registered in `mobile/src/app/_layout.tsx`
  inside the games guard; `mobile/src/lib/hot-potato-storage.ts` for the setup.
- Offline web: `/games/potato` added to `GAMES_PAGES` in `src/lib/games-offline.ts` and
  `public/sw.js`, and `GAMES_CACHE` bumped to `games-v4` in `src/lib/games-offline.ts`.
- The other games' code is not changed.

## Accessibility

- Pass is a large button with a label naming the holder.
- The bang is announced to screen readers; the pulse is decoration only.
- Colours are never the only signal: names are always written.

## Testing

- `src/lib/hot-potato.test.ts`: validation, pass order skipping players who are out, lives and
  elimination, the winner, the next round's starter, fuse drawing within the range, pause and
  resume, a bang only once the fuse has run out, a late Pass that bangs, the tap guard, the
  1.5 s lock on Next, no repeated task in a game, letter tasks only from `POTATO_LETTERS`.
- A letters test: every pair in `POTATO_LETTERS` starts at least 5 words of that category in the
  Describe It list, every letter is a candidate letter of its language, and idioms are absent.
- `src/lib/hot-potato-prompts.test.ts`: at least 250 tasks per language, ids in order, no
  duplicates (compared lowercased, without spacing and punctuation), one line, at most 60
  characters, no trailing full stop, a capital first letter, no circumflex in TR.
- Screens on both platforms with the existing component test harness.
- Before the device check: web build, the single-React bundle check, and the adb launch check
  when the phone is attached.

## Delivery

- Branch `feature/hot-potato` from `main`, in the worktree `.claude/worktrees/hot-potato`.
- Code by one implementer agent, task lists by one agent per language, then an independent
  review.
- The owner approved going all the way without check-ins for this game: push, PR, publish to
  the phone and merge, after the gates pass.
- Mobile ships as an `eas update`: no native module is added.
