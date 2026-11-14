# Who Am I? — design

Date: 2026-11-14. The fifth game in the Games section, after Imposter, Describe It, Wolf Night and
Hot Potato (`2026-11-14-hot-potato-design.md`).

## Goal

A forehead guessing game: the player whose turn it is holds the phone to their forehead, facing
the table. The others see a name ("Marie Curie") and give hints until the player guesses it, then
the player taps **Got it** or **Pass** and the next card comes. A turn lasts a fixed time. The
owner asked above all for a large pool of "who" cards, so most of the work is the card list. It
ships on web and mobile together, works offline, and reuses the other games' frame, palette,
colours and setup steps. Forehead guessing is a common party-game genre; the name, texts and look
are our own.

Name: **Ben Kimim?** (TR) / **Who Am I?** (EN). Route `/games/who` on both platforms.

## Decisions

| Topic | Decision |
|---|---|
| Card kinds | Famous real people, fictional characters, and things (animals, jobs, objects); chosen in setup |
| Card source | People and characters: candidates pulled from Wikidata, ranked by how many Wikipedias cover them, then curated by agents. Things: the Describe It word lists |
| Region | Every person and character card is marked Turkey or World; setup picks Turkey, World or Mixed |
| Hint line | Every card shows a short "who is this" line for the hint givers |
| Play | Solo (each player for themselves) or two teams, chosen in setup |
| Answering | Taps on two large screen halves, no tilting (tilting needs a sensor module and a new APK) |
| Not included | Sound, tilting, online play |

## Cards

### Kinds

- **People** (`people`): famous real people from the arts, music, film and TV, sports, science and
  invention, literature, history and exploration, and the internet.
- **Characters** (`characters`): fictional characters from cartoons and animation, films, series,
  books, comics, fairy tales, folk tales and mythology.
- **Things** (`things`): the Describe It `animals`, `jobs` and `objects` lists in the app's
  language. Their hint line is the category name; their level is the Describe It level; they have
  no region.

### Card shape

People and characters are one bilingual list. A row is
`[nameTr, nameEn, region, level, hintTr, hintEn]`:

- `nameTr` / `nameEn`: the name as players say it in that language. Most people have the same name
  in both; characters often differ ("Pamuk Prenses" / "Snow White").
- `region`: `"tr"` (known mainly in Turkey) or `"world"`.
- `level`: `"easy"` (most of a mixed adult table knows them) or `"hard"`.
- `hintTr` / `hintEn`: what they are, at most 50 characters, for example "fizikçi, Polonya ve
  Fransa" / "physicist, Poland and France". It never contains the card's name or a word of it.

A card's id is `<file>-<n>`, from its position in its file, so rows are only ever appended.
Things keep their Describe It ids with a `things:` prefix.

### Content rules

- Family friendly. No politicians or heads of state (current or past, incl. royals known mainly
  for ruling), no religious figures, no military leaders, no criminals, no people known for adult
  content or for hatred, and no minors.
- Historical figures known for science, art, exploration or invention are welcome.
- Characters: no adult-only franchises.
- Names are written the way the table says them: "Messi", "Barış Manço", "Mozart", "Pamuk
  Prenses". Turkish names keep their Turkish letters; no circumflexes in Turkish text.
- No duplicates within a kind (compared lowercased with spacing and punctuation removed).

### Sizes

At least 2500 people (about 1800 World and 700 Turkey), at least 1000 characters, and the
Describe It things (well over 600 per language). Each region and level combination of people
has at least 150 cards.

### The Wikidata pipeline

- A script in `scripts/who-game/` queries the Wikidata Query Service per occupation group and per
  character class, with a generic User-Agent and a pause between queries.
- It ranks candidates by their number of Wikipedia sitelinks. People with Turkish citizenship use
  a lower threshold so Turkish celebrities get in.
- Each candidate keeps its labels, descriptions, occupations, countries, years and sitelinks.
- It writes the candidates outside the repository, split into batches by domain.
- Agents curate each batch into one card file under `shared/who-cards/`:
  - drop people the rules exclude and names a party table would not know;
  - set the region and level;
  - write both names and both hint lines.
- Wikidata data is CC0. The script stays in the repository so the list can be pulled and grown
  again; the raw candidates are not committed.

## Setup wizard

Three steps with progress dots and Back / Next, like Describe It. Settings are remembered on the
device; **Start with last settings** on step 1 when they are valid.

1. **Players.** Solo or Two teams.
   - Solo: 2 to 12 players (Imposter's players step).
   - Two teams: Describe It's teams step (team names, 2 to 8 players each).
2. **Cards.**
   - Kinds: People, Characters, Things (at least one; default People and Characters).
   - Region: Turkey, World or Mixed (default Mixed in TR, World in EN). Ignored for Things.
   - Level: Easy, Hard or Mixed (default Mixed).
3. **Rules.** Turn length 30, 60 or 90 s (default 60); rounds 1 to 3 (default 2). Every player
   (solo) or every team plays one turn per round.

If the chosen cards leave fewer than 50 unseen cards, the seen list is cleared for them first; if
the pool itself has fewer than 50, the setup shows an error and suggests adding kinds or regions.

## A turn

1. **Handoff.** The screen names who guesses ("Ayşe" or "Red team: Ayşe guesses") and says to
   hold the phone to the forehead, screen out, then tap **Start**. In team mode the guesser rotates
   within the team turn by turn.
2. **Guessing.**
   - The screen shows the card's name in very large type, the hint line under it, and the time
     left, all readable from across a table.
   - The screen is two large tap halves: **Got it** (+1) and **Pass** (0, unlimited). The holder
     cannot see them, so each half is a big, clearly coloured area.
   - A tap within 400 ms of the previous one is ignored.
   - After each tap the next card shows at once.
3. **Time up.** The phone vibrates (React Native `Vibration`, web `navigator.vibrate` where it
   exists) and the turn ends. A card on screen at that moment counts as passed.
4. **Summary.** The turn's cards in order, each marked Got it or Passed. Tapping a card flips its
   mark, to fix a wrong tap. **Next** goes to the next handoff. For 1.5 s after the turn ends the
   cards and **Next** are off and the game ignores taps on them, so a guesser still tapping blind
   cannot flip a card or skip the summary (as Hot Potato's Next after the bang).

The turn time runs only while the game is on screen: it pauses when the app or page goes to the
background and, on mobile, while another screen (the game-mode PIN screen) covers the game, as in
Hot Potato. Times are measured by the reducer from the actions' `at`, never by the screen.

**End:** after the last round, the scores (players or teams) with the winner or a tie,
**Play again** (same setup) and **New game** (setup).

Cards seen on the device (Got it or Passed) are not dealt again until the chosen pool runs low,
as in Describe It. The seen list is stored per language.

## Code structure

- `shared/who-cards/`: `types.ts` (row type, `cards()` id helper, kinds, regions, levels), one
  file per curated batch under `people/` and `characters/`, and `index.ts` exporting
  `WHO_PEOPLE` and `WHO_CHARACTERS`.
- `shared/who-game.ts`: setup types, defaults, validation, `parseSavedSetup`, deck building
  (kinds, region, level, seen, language; things from the Describe It lists passed in), and a pure
  reducer with phases `setup → handoff → turn → summary → end`. Actions carry `at`; randomness
  through an injected `Rng`.
- `shared/i18n.ts`: all strings in TR and EN.
- Web: `src/app/games/who/page.tsx` in `GamesShell`; components in `src/components/games/who/`
  inside `GameFrame`; a new entry on `src/app/games/page.tsx`; `src/lib/who-game.ts` re-exports.
- Mobile: `mobile/src/app/games/who.tsx` with `useEnterGameModeOnce` / `GamesPinSetup`;
  components in `mobile/src/components/games/who/` in `GameScreen` with `tone="game"`; a new
  entry on `mobile/src/app/games/index.tsx`; the route registered in `mobile/src/app/_layout.tsx`
  inside the games guard; `mobile/src/lib/who-game-storage.ts` for the setup and seen list.
- Offline web: `/games/who` added to `GAMES_PAGES` in `src/lib/games-offline.ts` and
  `public/sw.js`, and `GAMES_CACHE` bumped to `games-v5` in `src/lib/games-offline.ts`.
- The card lists load only with this game's page, not with the games list.
- The other games' code is not changed.

## Accessibility

- The two tap halves have labels ("Got it", "Pass") and are buttons.
- The time left is visible text; the end of a turn is announced to screen readers.
- Colours are never the only signal: halves and summary marks are written.

## Testing

- `src/lib/who-cards.test.ts`: per kind the minimum sizes and the region/level minimums; ids in
  order per file; every field non-empty and trimmed; region and level valid; names at most 40
  characters and hints at most 50; no hint contains its name or a word of it longer than 3
  letters; no duplicates within a kind; no circumflex in Turkish text.
- `src/lib/who-game.test.ts`: validation, deck building by kind/region/level/seen/language,
  things from passed-in lists, turn order (solo, teams with rotating guessers), Got it / Pass
  scoring, the tap guard, time up only after on-screen time runs out, pause and resume, the card on
  screen at time up counts as passed, summary flips, rounds and the end, Play again and New game.
- Screens on both platforms with the existing component test harness; the mobile focus and
  AppState pause as in Hot Potato.
- Before the device check: web build, the single-React bundle check, and the adb launch check
  when the phone is attached.

## Delivery

- Branch `feature/who-game` from `main`, in the worktree `.claude/worktrees/who-game`.
- One agent writes and runs the Wikidata script, curation agents turn its batches into card
  files, one implementer agent writes the game, then independent reviews of the code and the
  cards.
- The owner approved going all the way without check-ins for this game: push, PR, publish to the
  phone and merge, after the gates pass.
- Mobile ships as an `eas update`: no native module is added.
