# Paper Plane — design

Date: 2026-11-18. The eighth game in the Games section and the first single-player one.

## Goal

A one-tap reflex game: a paper plane flies through gaps between pencils and rulers drawn on a
notebook page. Tapping makes it climb; letting go makes it glide down. Every gap passed is a
point, and the game slowly speeds up. It is played offline on web and mobile, and the best score
is kept on the device. One-tap flyers are a genre; the name, theme, drawings, numbers and texts
here are our own. It must not copy any existing game's character, obstacles or look.

Name: **Kağıt Uçak** (TR) / **Paper Plane** (EN). Route `/games/plane` on both platforms. Colour:
sky (`sky-50` / `sky-600`, `dark:text-sky-400`), the same card pattern as the other games. Icon:
lucide `Send` on web, the matching icon on mobile.

The owner chose: single-player only, the notebook theme, and one difficulty curve with one best
score. No new native dependency, so mobile ships through an EAS update.

## Screens

1. **Ready.** The notebook page with the plane resting at the left third, the best score
   ("Rekor: 23"), and "Tap to start". The first tap starts the game and counts as a flap.
2. **Flying.** The score in large handwritten-style digits at the top centre. Nothing else on
   screen. While flying, the header back and exit are hidden and back asks "Leave the game?" like
   the other games (`useConfirmLeave`, `GameScreen` `confirmBack`).
3. **Paused.** When the game goes off screen (`useGameOnScreen`: app in the background, the
   game-mode PIN screen, the leave question), the world stops. Back on screen it shows
   "Tap to continue"; the tap only resumes, it does not flap.
4. **Game over.** The plane stops where it hit. A card shows the score and the best score, with
   "New best!" when it was beaten, and **Again** / **Back to games**. Back on this screen and on
   Ready leaves without asking. The card and its buttons ignore taps for 500 ms, so a tap meant
   as a flap does not restart the game.

## World and physics

All game logic lives in `shared/paper-plane.ts` as pure functions with no React, no timers and
no platform code, driven by elapsed time so 60 Hz and 120 Hz screens play the same.

- The world is 100 units high. Its width follows the screen's aspect ratio, clamped to 45–80
  units; a wider screen shows the page centred with plain margins.
- `step(state, dt)` advances the world. `dt` is clamped to 1/30 s and integrated in sub-steps of at
  most 1/120 s, so a slow frame does not let the plane pass through an obstacle.
- Gravity 260 units/s². A flap sets the vertical speed to −78 units/s (upward). Fall speed is
  capped at 120 units/s. The plane's nose angle follows its vertical speed, from −25° climbing to
  +60° falling.
- The plane sits at 30% of the world width. Its hitbox is a 6 × 3 unit rectangle, smaller than
  the drawing, so grazes are forgiven.
- Touching an obstacle, the top edge or the bottom edge ends the game.

## Obstacles and difficulty

- An obstacle is a pair: one from the top, one from the bottom, 9 units wide, with a gap between
  them. Obstacles are 38 units apart horizontally; the first one enters 1.5 s after the start.
- Passing an obstacle's right edge with the plane's left edge scores 1 point.
- Speed starts at 30 units/s and rises by 0.5 per point up to 50 at 40 points. The gap starts at
  32 units and narrows by 0.25 per point down to 22 at 40 points. After 40 points nothing changes.
- The gap centre is drawn with the game's `Rng` between 12 units from the top and bottom edges
  (plus half the gap). Two consecutive gap centres differ by at most 30 units, so every layout
  can be flown.
- Up to 4 obstacles are kept: the ones on screen plus one waiting off screen at the right. One
  leaving at the left is dropped.

## Look

Everything is drawn in code; no image files.

- **Page.** Light theme: cream paper (`#fdfbf3`), pale blue ruled lines every 6 units, one red
  margin line at the left. Dark theme: deep navy paper with faint lines. The ruled lines stay
  still; a red margin line repeats every 120 units of flight and scrolls with the world, so
  passing pages show the speed.
- **Plane.** A folded paper plane in pencil outline (white fill, dark grey stroke, one fold
  line), tilted by its nose angle.
- **Obstacles.** Alternating coloured pencils (sharpened tip towards the gap) and a wooden ruler
  with tick marks, drawn as flat shapes.
- **Score.** Large digits in a slanted, hand-drawn style, with a soft paper-white outline so they
  read over the lines.

Web draws on a `<canvas>` sized to its container at the device pixel ratio. Mobile draws with
plain `View`s whose positions and rotations are Reanimated shared values, so a frame does not
re-render React; React renders again only when the score or the screen changes.

## Game loop

- Web: `requestAnimationFrame` calls `step` and redraws the canvas.
- Mobile: a JS-thread frame loop (`requestAnimationFrame`) calls the same `step` and writes the
  plane and obstacle positions to shared values. If the device shows dropped frames, moving the
  step into a Reanimated worklet is the follow-up; it is not in this design.
- A tap anywhere on the play area flaps (web: `pointerdown` and Space; mobile: `Pressable`
  `onPressIn`, which fires on touch down).

## Storage

The best score is one integer, saved when a game ends. Web: `localStorage` key
`paper-plane-best`. Mobile: AsyncStorage, fail-soft like `scale-game-storage.ts`: a storage error
shows a best of 0 and never stops the game. `parseSavedBest` in the shared module rejects
anything that is not a non-negative integer. Mobile shows the best line blank, keeping its space, until a read of the stored best has come back, and judges a read that lands late against every game already played on the screen, since reads can land out of order.

## Offline and navigation

- Add `/games/plane` to `GAMES_PAGES` in both `src/lib/games-offline.ts` and `public/sw.js`, and
  bump the cache to `games-v7`.
- Add the card to the games list on web and mobile, after One Clue.
- New translation keys in both `en` and `tr`.

## Testing

- `shared/paper-plane.ts` (vitest, web root): gravity and the fall cap, flap, nose angle, dt
  clamping and sub-steps (a 1/30 s frame cannot skip through a 9-unit obstacle), scoring once per
  obstacle, edge and obstacle collisions with the forgiving hitbox, the difficulty curve and its
  cap at 40, gap centres within bounds and the 30-unit step, and a reachability search over flap /
  no-flap choices every 1/30 s that finds a way past the speed cap (45 points) at widths 45 and
  80, on the worst layout (every gap as far from the last as allowed) and on a seeded one.
- Web page: Ready → Flying → Game over with a fake clock, Space flaps, the best score saved and
  shown, the 500 ms tap guard.
- Mobile: the screen with the existing hook-mock harness: pause on `useGameOnScreen` false and
  "Tap to continue", `confirmBack` only while flying, the best score saved through the storage
  module.

## Out of scope

Sound and vibration (both need a new APK), a pass-the-phone mode, difficulty levels, medals or
collectibles, online leaderboards.
