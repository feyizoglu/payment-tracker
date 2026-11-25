# Bill Hunt (Fatura Avı) — design

A single-player ball-shooter in the Games section, on web and mobile. Coins are thrown with a
slingshot pull and bounce around a grid of bills; every hit pays one off. Each round is a month:
the bills move down a row and a new row comes in. The game ends when a bill reaches the last row.

The genre is the well-known "aim, throw a volley, break numbered blocks" game; the name, theme,
look and rules below are this app's own.

## Where it lives

- Web `/games/bills`, mobile `/games/bills`, a new card in the Games list on both, after Secret
  Word. Like the other games it needs sign-in, stays open in game mode and works offline: the page
  joins `GAMES_PAGES` in `src/lib/games-offline.ts` and `public/sw.js`, and the cache becomes
  `games-v10`.
- No new native module: mobile draws with Views and Reanimated, like Paper Plane and Book Tower.

## The board

- 7 columns × 9 rows of square cells, the launcher below the last row.
- A cell holds at most one item: a bill, a "+1 coin", or one of four power-ups.
- Row 0 is the top. The last row (row 8) is the danger row.

## A month (round)

1. The game starts in month 1 with 1 coin and one row spawned in row 0.
2. Aim and throw (below). When every coin is down, the month ends:
   - used power-ups that stay (row cut, column cut, deflector) are removed;
   - the coins collected this month are added to the coin count;
   - the launcher moves to where the first coin landed;
   - every item moves down one row and a new row spawns in row 0;
   - a bill in the danger row ends the game; other items that reach it are removed.
3. A new row holds:
   - 1 to `min(4, 2 + floor(month / 8))` bills in distinct random columns;
   - exactly one "+1 coin" in another column;
   - with probability 0.4, one power-up in another free column, picked with weights row cut 2,
     column cut 2, deflector 2, campaign 1.
4. A bill's amount is the month number; with probability 1/5 it is doubled (a double bill, drawn
   differently).
5. The score is the number of months completed. The best is kept on the device under
   `bill-hunt-best`.

## Aiming (slingshot)

- Put a finger (or the mouse) anywhere on the board and pull back: the coins go the opposite way
  of the pull.
- The aim is shown as a dotted line from the launcher to the first thing the coin would hit,
  computed by running one ghost coin with the same mover the throw uses.
- The direction is clamped to between 8° and 172° above the horizontal. A pull shorter than 4
  world units, or one that points the throw downwards, shows no line, and letting go then throws
  nothing.

## The throw

- Coins leave the launcher one after another, 0.08 s apart, all in the aimed direction, at 90
  world units per second.
- They bounce off the side walls, the ceiling and bills. Each bounce off a bill takes 1 off it; a
  bill at 0 disappears. A bill loses at most 1 to the same coin in one sub-step, even at a corner.
- Coins pass through every other item; what happens is triggered once each time a coin's centre
  enters the item's cell.
- A coin that reaches the floor stops there. The first one down sets the next launcher position.
- So that no coin bounces sideways forever, after every bounce a coin moving more flatly than 8°
  is turned to 8° (its speed stays the same).
- Every throw ends: after 30 s of game time (sped-up time counts as game time) the throw is called
  back automatically.
- The coin count is capped at 120: a "+1 coin" collected at the cap is still removed but adds
  nothing.
- While coins are in the air two buttons show:
  - **Speed up (⏩):** the rest of this throw runs 3 times faster.
  - **Call back:** the throw ends at once; coins still in the air or not yet thrown count as
    down, their remaining hits do not happen. With no coin down yet the launcher stays put.

## Items

| Item | When a coin enters it | Stays |
|---|---|---|
| +1 coin | One more coin from next month on. | Removed when collected. |
| Row cut (↔) | Every bill in the same row loses 1. | Until the end of a month in which it was entered. |
| Column cut (↕) | Every bill in the same column loses 1. | Same as row cut. |
| Deflector (🔀) | The coin turns to a random upward direction between 20° and 160°. | Same as row cut. |
| Campaign (💥) | Every bill in the 8 neighbouring cells loses 3 (a bill at 0 or below disappears). | Removed at once. |

A cut that brings a bill to 0 removes it, exactly like a hit. Items do not change the score.

All randomness (rows, power-up picks, deflector angles) comes from an injected random source, so a
seeded test can replay a game.

## Screens

- **Ready:** a short description, the best score and a Start button.
- **Playing:** "Month 7" and "×12" (coins) at the top; the aim line while pulling; Speed up and
  Call back while coins are in the air.
- **Over:** "You lasted N months" style score card with the best and a "New best!" badge, Play
  again and Back to games. Both buttons stay disabled for 500 ms after the game ends, as in Book
  Tower.
- Look: bills are small receipt cards showing their amount, shaded by amount relative to the
  month; double bills have a darker edge. Coins are gold circles; the "+1 coin" a small gold
  coin marked +1; power-ups are round badges with ↔ ↕ 🔀 💥. The board has a light and a dark
  palette following the app theme, and the overlay text takes its colour from the board's
  palette, as in Book Tower.

## Platform behaviour

- **Mobile:** the game screen asks "Leave the game?" on back while a game is running, and the
  throw stops while the screen is not shown (background, PIN screen, dialog), using the existing
  `useConfirmLeave` and `useGameOnScreen`. The best goes through `useSoloBest`. All coins are
  drawn (at most 120, the cap). The pull uses `PanResponder`, as the Scale needle does.
- **Web:** a canvas with pointer events for the pull (with pointer capture, and a cancelled pointer
  cancels the aim), scaled to its box, following the light/dark theme; best through `saved-best`. A hidden tab simply stops the frames; the simulation never
  takes a step longer than 1/30 s.

## What it does not do

- A game in progress is not saved: leaving the screen ends it.
- No sound (mobile sound needs a new APK).

## Code

- `shared/bill-hunt.ts`: pure rules, no React. World units: cell 10, board 70 × 90.
  - `newHuntGame(rng)`, `huntStart(state)`
  - `huntAim(dx, dy)` → angle or null (the pull vector in world units)
  - `huntAimEnd(state, angle)` → the end point of the aim line
  - `huntFire(state, angle)`, `stepHunt(state, dt, rng)`, `huntSpeedUp(state)`,
    `huntCallBack(state, rng)`
  - `huntViewport(width, height)`, `huntBillShade(value, month)`, `HUNT_COLORS`, constants.
  - `stepHunt` runs fixed sub-steps of 1/240 s (a coin moves at most 0.375 units per sub-step,
    well under its radius, so it cannot pass through a bill), moving x then y and bouncing on
    overlap. Collisions look up only the cells a coin's box touches (a 7 × 9 cell index), never
    scan every item; the state is copied once per `stepHunt` call, not per sub-step.
- `src/lib/bill-hunt.ts` re-exports it for web.
- Web: `src/app/games/bills/page.tsx`, `src/components/games/bills/{HuntGame,HuntOverlay}.tsx`,
  `draw-hunt.ts`.
- Mobile: `mobile/src/app/games/bills.tsx`, `mobile/src/components/games/bills/{hunt-world,hunt-overlay}.tsx`,
  `mobile/src/lib/bill-hunt-storage.ts`.
- i18n: `hunt*` keys in English and Turkish; the score card reuses the `solo*` keys.
- Tests: unit tests for the rules (seeded), drawing and screen tests in the style of Book Tower's,
  and a seeded auto-player that plays several whole games with random legal aims and checks that
  every throw ends within the cap, no coin overlaps a bill or leaves the board, coins grow only by
  collected "+1 coin"s, and every game ends.
