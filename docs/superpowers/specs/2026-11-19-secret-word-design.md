# Secret Word — design

Date: 2026-11-19. The tenth game in the Games section and the third single-player one, after
Paper Plane and Book Tower.

## Goal

A word-guessing game. The game hides a five-letter word; the player has six guesses. After each
guess every letter is marked: in the right place, in the word but elsewhere, or not in the word.
Guessing the word wins the round and adds one to the streak; six misses end the streak. The best
streak is kept on the device. It is played offline on web and mobile.

Positional letter feedback is a genre (Mastermind, Lingo). The name, look, marks, colours and
texts here are our own, and the game must not look like any existing word game: no grid of
coloured squares, no flip reveal, no daily word, no share grid.

Name: **Gizli Kelime** (TR) / **Secret Word** (EN). Route `/games/secret` on both platforms.
Colour: indigo (`indigo-50` tile, `indigo-600` icon on web). Icon: lucide `SpellCheck` on web, 🔤
on mobile. The card goes after Book Tower. No new native dependency, so mobile ships through an
EAS update.

## Words

- Answers come from the Describe It word lists (`shared/word-game-words`) of the round's language,
  every category but idioms: single words of exactly five letters of that language's alphabet,
  first card kept when a word repeats. About 519 Turkish and 354 English answers. An answer's id
  is its Describe It card id, so the append-only rule of those lists keeps ids stable.
- Alphabets: Turkish `ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ` (29), English `A–Z`.
- Upper-casing never relies on the runtime's locale (Hermes may ignore it): Turkish maps `i→İ` and
  `ı→I` explicitly before `toUpperCase()`. Words are stored and compared upper-case, letter by
  code point.
- **A guess must be a word** (added 2026-11-19 at the owner's request; first shipped without this). A guess
  counts when it is a root in the language's word list or one of the answers; otherwise "Not in the
  word list." shows, no try is used and the letters stay. Roots only, no inflected forms. Turkish: the
  five-letter headwords of Zemberek's `master-dictionary.dict` (Apache 2.0) plus the stems of its verbs,
  which it lists as infinitives (BEKLE from beklemek; the infinitives themselves stay), about 5,300.
  English: the five-letter words of the public-domain ENABLE list without the regular inflections of
  another word (-s, -es, -ies, -ves, -ed, -ing; irregular forms like TEETH stay), about 5,800. Both are generated
  into `shared/secret-word-dictionary/` by `scripts/secret-word/build-dictionary.ts`; attribution in its
  `NOTICE.md`.
- Place names (PARİS, İZMİR, TEXAS…) stay in. Owner-reversible.
- The answer's category is shown as a hint from the start ("Hint: 🐾 Animals"). Owner-reversible.
- A word is not dealt again until every answer of that language has been seen. The seen list is
  stored per language (`secret_word_seen_<lang>`); once all are seen it starts over, never
  repeating the last word.

## Rules

- Marks are scored in two passes, so repeated letters are fair: exact matches first, then
  "elsewhere" only while that letter's unmatched count in the answer lasts.
- The keyboard shows the best mark each letter has had (right place > elsewhere > not in it); a
  key's mark only ever improves.
- Every key stays typeable. A "not in it" key keeps the normal key background and only greys its
  letter (2026-11-25: the owner read the earlier faded, struck-through key as disabled).
- **Reveal a letter** (added 2026-11-25, owner's choices): once per round, a button shows the
  leftmost letter no guess has hit yet, in its place, on its own line of the page. It costs one of
  the six tries, so it is offered only while at least one guess would be left after it. The
  revealed letter's key is marked as found. "Got it on try n" counts the reveal as a try.
- Enter with fewer than five letters does nothing but show "Five letters, please."; Enter on a
  non-word does nothing but show "Not in the word list."
- A round keeps the language it started in. The next round uses the current app language.
- **Streak.** A win adds one, a loss sets it to 0. The streak lives on the screen: leaving the
  game ends it. The best streak is stored (`secret-word-best`) with the session best rule the other
  single-player games use (`shared/best-score.ts`), checked after every win, so leaving after a
  win never loses a best.

## Screens

One screen. Top: the hint and the streak. Middle: the notebook page with six lines. Bottom: the
keyboard; when the round ends the keyboard is replaced by the result panel:

- **Won:** "Got it on try {n}!", the streak, "New best!" or the best, **Next word** and **Back to
  games**.
- **Lost:** "The word was {word}.", the best, **Again** and **Back to games**.

The panel's buttons ignore presses for 400 ms after the round ends, so a fast tap meant for the
keyboard cannot skip the result (a time check in the handler, no timers). On web, Enter on the
panel starts the next round after the same 400 ms.

Mobile: while a round has a guess or the streak is above 0, the header back and exit are hidden and
back asks "Leave the game?" (`useConfirmLeave`, `GameScreen confirmBack`).

## Look

A lined notebook page, like Paper Plane's: pale paper, ruled lines, a red margin line. Each guess
is written on a line as five letters. Marks are shapes as well as colours, so they read without
colour:

- **Right place:** the letter in a filled indigo circle.
- **Elsewhere:** the letter with a thick amber underline.
- **Not in it:** the letter greyed and struck through.
- An empty slot is a short ruled dash; typed letters are plain ink.

A legend under the page shows the three marks. Keys are plain rounded keys; a key takes its
letter's mark (indigo fill, amber underline, greyed and struck through). Enter is `↵` and delete is
`⌫`, with spoken labels. Light and dark palettes; web follows the page theme, mobile the system
scheme as Book Tower does.

Keyboard rows: Turkish `ERTYUIOPĞÜ` / `ASDFGHJKLŞİ` / `↵ ZCVBNMÖÇ ⌫`; English `QWERTYUIOP` /
`ASDFGHJKL` / `↵ ZXCVBNM ⌫`. Keys share each row's width, so the 11-key Turkish row fits a 360 px
screen.

## Input

- Both platforms use the in-app keyboard. Mobile never opens the system keyboard (Samsung's
  Turkish keyboard is a known risk). Letter and delete keys act on touch; Enter acts on release, so
  a thumb resting on it submits nothing.
- Web also takes the physical keyboard: `e.key` goes through the same letter table (so `i` is `İ`
  in Turkish), Enter submits, Backspace deletes. Keys with Ctrl, Meta or Alt held and repeated
  Enter are ignored, as are keys typed into a focused field; Enter on a focused button or link is
  left to that control.

## Storage

Web `localStorage`, mobile AsyncStorage, both fail-soft. Mobile reads the best and the seen list
once when the screen opens and deals the first word only after both reads settled (a failed read
is an empty list and an unknown best). Afterwards they live in refs and are only written, never
re-read, so no read can land out of order.

## Offline and navigation

- `/games/secret` in `GAMES_PAGES` (`src/lib/games-offline.ts` and `public/sw.js`), cache
  `games-v9`.
- Cards in both games lists; `games/secret` registered in `mobile/src/app/_layout.tsx`.
- Indigo dark shades: web adds `indigo-200`; mobile themes `indigo-50` in `tailwind.config.js`,
  `tailwind.css` and `GAME_DARK_TOKENS`.
- New translation keys in `en` and `tr`.

## Testing

- Engine: alphabets and upper-casing (`i`/`ı` in Turkish), every answer being five letters of its
  alphabet, marks with repeated letters (KÖPEK, TİLKİ, SÜLÜK), key marks only improving, typing
  past five letters, short Enter, winning, losing on the sixth guess, dealing unseen words and
  starting over.
- Web: typing with the on-screen and the physical keyboard, modifiers ignored, a win raising the
  streak and saving the best, a loss resetting it, the 400 ms panel guard, seen words saved.
- Mobile: no word until both reads settle, `confirmBack` only with a guess or a streak, the best
  and seen list through the storage module.

## Out of scope

Inflected forms as guesses, daily words, sharing, hard mode, sound.
