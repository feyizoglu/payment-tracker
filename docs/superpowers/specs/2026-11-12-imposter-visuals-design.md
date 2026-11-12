# Imposter game visuals — design

Date: 2026-11-12. Follows `2026-11-11-imposter-game-design.md`; the game rules do not change.

## Goal

Make the Imposter game feel like a party game instead of a settings form, on web and mobile:
a step-by-step setup, a colour per player, and a card that shows the secret only while it is
held down. The design is our own; no existing app's look is copied.

## Decisions

| Topic | Decision |
|---|---|
| Platforms | Web and mobile get the same flow and colours |
| Setup | Three steps plus a "start with last settings" shortcut |
| Reveal | Hold to see, release to hide; can be repeated. On desktop web a Show / Hide button instead |
| Colour | Each player has their own colour for the whole game |
| Role and colour | The card never changes colour with the role (see Reveal) |

## Player colours

- `shared/imposter.ts` exports `PLAYER_COLORS`: 12 hex colours, each readable with dark text
  on top, and `playerColor(index)` which returns `PLAYER_COLORS[index % 12]`.
- A player's colour is their position in the player list. `MAX_PLAYERS` is 12, so colours do
  not repeat in one game.
- Removing a player in setup shifts the colours of the players after them. Once a round has
  started the list is fixed, so colours are stable for the game.
- Players cannot pick their colour.

## Setup wizard

One screen with three steps, a row of progress dots on top and Back / Next at the bottom.
`ImposterSetup` and its storage are unchanged; the wizard only changes how it is edited.

1. **Players.** One card per player in that player's colour, with the name field and a remove
   button, plus "Add player". When a game was played on this device before and the settings
   on screen pass `validateSetup`, a **Start with last settings** button is shown here. It
   starts the round at once with the settings as they are now, including any name just
   edited on this step.
2. **Category.** A grid of large tiles, one per `CATEGORY_CHOICES` entry, each with an emoji
   and the category name: 🎲 mixed, 🐾 animals, 🍕 food, 🧑‍🚒 jobs, 🏝 places, 📦 objects,
   ⚽ sports. The emoji map lives next to `CATEGORY_LABEL_KEYS` in `shared/imposter.ts`.
3. **Rules.** Mode, "imposter knows their role" (similar-word mode only), imposter count,
   timer, secret voting, scoreboard, and the **Start** button.

Step validation: `shared/imposter.ts` exports `SETUP_STEPS = ["players", "category", "rules"]`
and `stepErrors(setup, step)`, which returns the `validateSetup` errors that belong to that
step (player-count and name errors to `players`; imposter-count and scoreboard errors to
`rules`; `category` has none). Next is disabled while the current step has errors, and the
errors are shown on that step. Start is disabled while `validateSetup` returns anything.

Changing the player count can make the imposter count invalid; that error appears on the
rules step, as it does today on the form.

The wizard always opens on step 1. The current step is not saved.

## Reveal: hold to see

The deal phase keeps its reducer actions (`reveal`, `next`).

- The whole screen is the current player's colour: "Pass the phone to <name>".
- A large card in the middle says "Hold to see". While it is pressed the card shows that
  player's content (the word, the pair word, or "You are the imposter" with the category);
  on release it hides again.
- The first press dispatches `reveal`, which enables **Next player**. Later presses only show
  the card again.
- The card shows only once the reducer accepted the `reveal`. A press inside the tap guard
  (400 ms after the previous player's Next) is ignored and shows nothing, so "has seen the
  card" and "may pass the phone on" never disagree.
- On mobile the deal screen does not scroll: inside a scroll view a drifting finger would
  end the hold.
- The card hides when the press is cancelled, when the app goes to the background (mobile
  `AppState`), or when the page is hidden or loses the pointer (web `visibilitychange`,
  `pointercancel`, `pointerleave`).
- Web on a touch device: the same hold card, through pointer events, with text selection and
  the long-press context menu disabled on it.
- Web on a desktop (a device whose primary pointer is fine and can hover, read with
  `matchMedia("(hover: hover) and (pointer: fine)")`): no holding. The card has a **Show**
  button; clicking it shows the content and turns the button into **Hide**. The first Show
  dispatches `reveal`. The card still hides when the page is hidden, and **Next player** hides
  it before moving on. Being a real button, it works from the keyboard as it is.
- **The card and the screen keep the player's colour whatever the role is.** A differently
  coloured imposter card could be seen from across the table and would give the imposter
  away. Only the text differs.

The vote phase stays tap-based: the screen takes the voter's colour, and each candidate is a
button in that candidate's colour.

## Other game screens

- The game screens (setup, deal, discuss, vote, result) use a dark background of their own,
  independent of the app's light or dark theme, so the player colours read the same
  everywhere. The games list and the PIN screens keep the app theme.
- Discuss shows who starts on that player's colour; result and scoreboard write each name in
  that player's colour. Layout and content stay as they are.
- On a player's colour, text and buttons are a fixed dark; on the dark background the
  existing blue primary button stays.
- No new animations beyond a short fade when the card shows. It hides at once.

## Architecture

- `shared/imposter.ts`: `PLAYER_COLORS`, `playerColor`, `GAME_THEME` (the fixed game
  colours), `CATEGORY_EMOJI`, `SETUP_STEPS`, `stepErrors`. Pure, no platform APIs.
- `shared/i18n.ts`: new keys in `en` and `tr` (step titles, Next, Back, "Start with last
  settings", "Hold to see", "Show", "Hide").
- Web (`src/components/games/`): `ImposterSetupForm` is replaced by `ImposterSetupWizard`
  with one component per step; a new `DealTurn` holds the hold card and the desktop button,
  and `PassPhone` stays as the vote gate; `ImposterDiscuss`, `ImposterResult` and the vote
  view take player colours; a new `GameFrame` draws the dark background by putting the
  `dark` class on a wrapper, so the themed classes inside take their dark values.
- Mobile (`mobile/src/components/games/`): the same split: `imposter-setup` becomes the
  wizard with step components, a new `deal-turn` holds the hold card, the other screens take
  player colours. `GameScreen` gets `tone="game"` (the dark palette through NativeWind
  `vars()`), `color` (a player's colour for the body) and `scroll={false}`.
- No new dependencies on either platform, so mobile ships with `eas update`.

## Out of scope

Sound, haptics beyond the existing timer vibration, avatars, choosing a colour, result
animations, any change to rules, scoring, word lists or saved settings format.

## Testing

- `src/lib/imposter.test.ts`: `playerColor` wraps at 12 and all 12 colours are distinct;
  `stepErrors` assigns every `SetupError` to exactly one step and returns nothing for a valid
  setup; `CATEGORY_EMOJI` covers every `CATEGORY_CHOICES` entry.
- Web component tests, in the style of the existing ones: Next is disabled with a step error
  and moves on without one; "Start with last settings" appears only for a valid saved setup;
  the hold card shows on pointer down, hides on pointer up, cancel and page hide, and enables
  Next player after the first press; on a desktop pointer the card shows a Show button that
  toggles to Hide and back, and no hold is needed; the card colour is the same for an
  imposter and a crew card.
- Mobile component tests for the same behaviour (`onPressIn` / `onPressOut`, `AppState`).
- i18n key parity is covered by the existing i18n tests.
- Mobile: `tsc`, `npx expo export --platform android`, and a check that the exported bundle
  contains one copy of `react`. Device check by the owner.
