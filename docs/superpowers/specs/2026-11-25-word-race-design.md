# Word Race (Kelime Yarışı) — design

A 60-second single-player game played with the user's own My Words list, on web and mobile.

## Where it lives

- Web `/words/race`, mobile `/words/race`, both behind sign-in like `/words/review`.
- The My Words page gets a "🏁 Word Race" button under the review button. It is disabled, with a
  hint, while fewer than four words can be asked (see below).
- The word list is read once when a race starts. Nothing is sent to the server while playing.
- Offline: each successful read is kept on the device (`localStorage` / AsyncStorage, key
  `words-race-list`), and a race starts from that copy when the read fails. On mobile the race then
  plays with no connection; on web the page itself still needs one to open.

## A round

- The clock starts at 60 seconds.
- Every word is asked, learned ones too: this is a game, not review.
- At least four words that can be asked are needed; that is the only gate.
- Each question shows a clue and four English words to choose from:
  - The clue is the word's Turkish meaning when it has one.
  - Otherwise it is the first dictionary definition, with the word itself masked as `___`
    (case-insensitive, whole words, also its `-s`, `-es`, `-ed`, `-d`, `-ing` forms).
  - A word with neither cannot be asked.
- Choices:
  - The answer plus three other words from the whole list, with words that can't be asked
    included. They are shuffled.
  - A word whose clue reads the same as the answer's (case and spacing ignored) is never a
    distractor, so exactly one choice is right.
- Questions come from a shuffled deck of the words that can be asked. When the deck runs out it
  is shuffled again, and the same word never comes twice in a row.
- A right answer scores 1 and raises the combo (shown as "🔥 x3" from 3 in a row).
- The clock is a deadline (`endsAt`); a wrong answer moves it 3 seconds earlier, resets the combo and puts the word on the missed
  list.
- After each tap the choices show right (green) and the wrong pick (red) for 600 ms, then the next
  question appears. The clock keeps running and taps are ignored during that time.
- The round ends when the clock reaches 0, including at once when a penalty crosses it. Taps at
  or after the deadline are ignored.

## The end screen

- Shows the score, the best combo, and the best score with a "New best!" badge.
- The best is kept on the device: `localStorage` on web, AsyncStorage on mobile. Web uses the
  `saved-best` helpers and mobile uses `useSoloBest` under the key `words-race-best`.
- It lists the missed words with their clue, so the user can go back to them.
- Buttons: "Play again" and "Back to My Words".

## What it does not do

- It does not change review streaks or learned state (a later iteration may let it count). A four-choice guess is weaker than
  recalling the word, so review stays the only thing that moves a word to learned.

## Code

- `shared/word-race.ts` holds the pure game logic. Time is passed in as `now`, and the random
  source can be injected:
  - `raceClue`, `raceWords`, `canRace`
  - `startRace(words, now, rng)`
  - `pickRace(state, id, now)`
  - `nextRaceQuestion(state, rng)`
  - `raceTimeLeft(state, now)`, `raceOver(state, now)`
- `src/lib/word-race.ts` re-exports it for web.
- Screens:
  - Web: `src/app/words/race/page.tsx`.
  - Mobile: `mobile/src/app/words/race.tsx`.
  - Both use a 250 ms ticker for the clock and a timeout for the feedback pause.
- i18n: `wordRace*` keys in English and Turkish.
- Tests:
  - Unit tests for the shared logic.
  - Screen tests in the style of the existing words and review tests.
