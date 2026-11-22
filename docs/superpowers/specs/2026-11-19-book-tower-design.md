# Book Tower — design

Date: 2026-11-19. The ninth game in the Games section and the second single-player one, after Paper
Plane.

## Goal

A one-tap timing game. A book slides back and forth above a stack of books on a desk. A tap drops
it onto the stack, and whatever hangs over the edge of the book below is cut off and falls away.
The next book comes in at the new, narrower width. A book that misses the stack ends the game.
Every book placed is a point, and the slide gets faster. It is played offline on web and mobile,
and the best score is kept on the device. Stacking games are a genre; the name, theme, drawings,
numbers and texts here are our own. It must not copy any existing game's look.

Name: **Kitap Kulesi** (TR) / **Book Tower** (EN). Route `/games/tower` on both platforms. Colour:
amber (`amber-50` tile; `amber-600` on web, `amber-700` on mobile, the shades each platform
already themes for dark mode). Icon: lucide `Library` on web, 📚 on mobile. The card goes after
Paper Plane.

The owner chose the book stack theme and the trim mechanic (no physics or toppling). No new native
dependency, so mobile ships through an EAS update.

## Screens

The same four screens as Paper Plane, built the same way:

1. **Ready.** The desk with the first book on it, the best score and "Tap to start". The first tap
   starts the sliding book; it does not drop it.
2. **Playing.** The score in large digits at the top centre. "Perfect!" shows for 0.6 s after a
   perfect drop. While playing, the header back and exit are hidden, and back asks "Leave the
   game?" (`useConfirmLeave`, `GameScreen` `confirmBack`).
3. **Paused.** When the game goes off screen (`useGameOnScreen` on mobile; tab hidden or window
   blur on web), the world stops. Back on screen it shows "Tap to continue"; the tap only
   resumes, it does not drop.
4. **Game over.** A card shows the score and the best score, with "New best!" when it was beaten,
   and **Again** / **Back to games**. The card ignores taps for 500 ms from its first frame.

## World and rules

All game logic lives in `shared/book-tower.ts` as pure functions with no React, no timers and no
platform code. It is driven by elapsed time, so 60 Hz and 120 Hz screens play the same; `dt` is
clamped to 1/30 s.

- The world is 100 units wide. A book is 7 units thick. The base book lies on the desk, 50 units
  wide and centred.
- The sliding book has the width of the top book. It slides fully past each edge of the page (its
  centre moves between −w/2 and 100 + w/2) and bounces there, so a drop can miss the stack from the
  first book on. Books start alternately from the left and the right end.
- Speed is 35 units/s and rises by 1.5 per point, up to 95 at 40 points. After 40 points nothing
  changes.
- **Drop.** The overlap of the sliding book and the top book becomes the new top book. The part
  outside the overlap becomes a falling piece. No overlap: the book falls whole and the game ends.
- **Perfect.** If the two centres are less than 1.5 units apart, the book lands exactly on the one
  below, keeps its width and nothing is cut. Every third perfect drop in a row adds 6 units of
  width, up to the starting 50.
- **Score.** Every book placed is one point.
- **Camera.** The view follows the stack so the top keeps 5 books below it on screen. The camera
  eases towards its target (about 0.25 s) instead of jumping.
- **Falling pieces** fall with gravity and a slow spin and are dropped once they are well below the
  view.

## Look

Everything is drawn in code; no image files.

- **Desk and wall.** A warm wooden desk strip at the bottom and a plain wall above. Light theme:
  cream wall, honey desk. Dark theme: deep navy wall, dark walnut desk.
- **Books.** Flat coloured rectangles from a 6-colour palette, picked by the book's order so a book
  keeps its colour. Each has two thin pale stripes near its ends, like a spine band.
- **Score and texts.** Drawn in the page's ink colour, as Paper Plane does.

Web draws on a `<canvas>` at the device pixel ratio. The world is scaled to fit the width, at most
the height allows, and centred. Mobile draws the stack with plain `View`s re-rendered on each drop.
The sliding book, the camera and the falling pieces are Reanimated shared values, so a frame does
not re-render React.

## Game loop and input

- Web: `requestAnimationFrame` calls the step and redraws. Mobile: the same JS-thread frame loop
  writes the shared values. Both use `shared/frame-loop.ts`.
- A tap anywhere on the play area drops. Web: primary-button `pointerdown` and Space; Space also
  plays again on the over card once its guard is off. Mobile: `Pressable` `onPressIn`.

## Storage

The best score is one integer, saved when a game ends. Web: `localStorage` key `book-tower-best`.
Mobile: AsyncStorage, fail-soft like Paper Plane's: a read that fails is `null`. The rule is Paper
Plane's session rule. Each screen keeps the highest score read or played, and whether any read has
succeeded. A new best is claimed only after a successful read, and the session best is saved
whenever it beats what was just read. The rule moves from `shared/paper-plane.ts` to a small
`shared/best-score.ts` so both games use one copy. Paper Plane re-exports it under its current
names. Mobile shows the best line blank, keeping its space, until a read of the stored best has come back, and judges a read that lands late against every game already played on the screen, since reads can land out of order.

## Offline and navigation

- Add `/games/tower` to `GAMES_PAGES` in `src/lib/games-offline.ts` and `public/sw.js`, and bump
  the cache to `games-v8`.
- Add the card to both games lists, and register `games/tower` in `mobile/src/app/_layout.tsx`.
- New translation keys in both `en` and `tr`.

## Testing

- `shared/book-tower.ts`: bouncing and the dt clamp, the trim on both sides, the perfect snap and
  the width growth with its cap, a miss ending the game, the speed curve and its cap, the camera
  target, falling pieces moving and being dropped, pause and resume, the first tap not dropping.
- Web page: Ready → Playing → Over with a fake clock, Space drops, the primary button only, the
  best score saved and shown, the 500 ms guard from the first frame.
- Mobile screen, with the hook-mock harness Paper Plane uses: pause off screen, `confirmBack` only
  while playing, the best score through the storage module.

## Out of scope

Sound and vibration, toppling physics, power-ups, daily challenges, online leaderboards.
