# Imposter game — design

Date: 2026-11-11. First item of the Games section in `docs/roadmap.md`.

## Goal

A pass-and-play party game on one device, on web and mobile, playable without internet. Every
player sees the secret word except the imposter(s); the group discusses and tries to find them.

## Entry points

- **Web:** a "Games" link in the top nav of every page that has one (`dashboard`, `economy`,
  `events`, `events/[id]` via `EventsHeader`). `/games` lists the games (one card for now);
  `/games/imposter` is the game. No login, no API call.
- **Mobile:** a game-controller icon in the Payments tab header opens the root-level `games`
  screen, which opens `games/imposter`. Both are root `Stack.Screen`s next to the existing
  modal routes, not tabs (Android's bottom bar already holds its maximum of 5).

## Setup screen

| Setting | Values | Default |
|---|---|---|
| Players | 3–12 names, remembered on the device | last list used |
| Mode | `no-word` ("You are the imposter", sees the category) / `similar-word` (sees the pair word, does not know they are the imposter) | `no-word` |
| Category | one category or `mixed` | `mixed` |
| Imposter count | 1 to `min(3, floor((players − 1) / 2))` | 1 |
| Discussion timer | off, 1–10 minutes | off |
| Secret voting | on / off | off |
| Scoreboard | on / off, only selectable when voting is on | off |

The settings are remembered on the device together with the player list.

## Round flow

1. **Deal.** "Pass the phone to <name>" → **Show** reveals that player's card → **Hide, next**.
   No going back. Player order is the setup order.
2. **Discuss.** A random player is named to start. If the timer is on, a countdown runs; at zero
   the mobile app vibrates and both platforms show "Time's up".
3. **Vote** (only when voting is on). The phone goes round again in setup order; each player
   secretly picks one other player. The single player with the most votes is revealed. If that
   player is an imposter, the crew wins the round; if they are innocent, or the top vote is a
   tie, the imposters win.
4. **Result.** Shows the word, the pair word (in `similar-word` mode) and the imposters. With
   voting off, the discuss screen has a **Reveal imposter** button that goes straight here.
5. **Score** (only when the scoreboard is on). Crew win: every non-imposter +1. Imposter win:
   every imposter +2.
6. **Next round** keeps players and scores and deals a new word; a word is not repeated in the
   same session until the chosen category runs out (then the used set resets). **End** returns
   to setup and clears scores.

Out of scope: the caught imposter guessing the word, custom words, multi-device play.

## Words

Six categories: Animals, Food, Jobs, Places, Objects, Sports; about 40 entries each. Each entry
is a pair `{ word, pair }` written in both languages:
`{ tr: { word: "Kedi", pair: "Köpek" }, en: { word: "Cat", pair: "Dog" } }`. The app language
picks the side. Category names come from i18n.

## Architecture

Same split as the payment logic (approach A):

- `shared/imposter.ts` — pure logic, no JSX, no platform APIs. Randomness is injected
  (`rng: () => number`) so tests are deterministic.
  - `maxImposters(playerCount)`
  - `validateSetup(setup)` → list of errors (too few/many players, blank or duplicate names,
    imposter count out of range, scoreboard without voting)
  - `dealRound(setup, usedWords, rng)` → `{ entry, imposters: number[], cards: Card[], starter }`
    where `Card` is `{ kind: "word", text } | { kind: "imposter", category }` (`no-word`) or
    `{ kind: "word", text }` with the pair text for imposters (`similar-word`)
  - `tallyVotes(votes, imposters)` → `{ accused: number | null, crewWins: boolean }`
    (`accused` is `null` on a tie)
  - `applyScore(scores, imposters, crewWins)`
- `shared/imposter-words.ts` — the category ids and word pairs (data only).
- `src/lib/imposter.ts` — one-line re-export shim, like the other `src/lib/*` shims.
- i18n: new keys added to both `en` and `tr` in `shared/i18n.ts`.
- **Web UI:** `src/app/games/page.tsx`, `src/app/games/imposter/page.tsx` and a
  `src/components/games/` folder (setup, deal, discuss, vote, result). Client components; state
  in a reducer; settings in `localStorage`.
- **Mobile UI:** `mobile/src/app/games/index.tsx`, `mobile/src/app/games/imposter.tsx`,
  `mobile/src/components/games/`. Settings in AsyncStorage. Timer vibration through
  `Vibration` from `react-native` (no new native module). Uses the
  existing `bg-surface` / dark-mode tokens.

## Offline

- **Mobile:** nothing extra — the screens and words are in the JS bundle. Ships with
  `eas update` (no native change).
- **Web:** `public/sw.js` today only handles push and is registered only by `PushToggle`.
  Changes:
  - The games pages register `/sw.js` themselves (same options as `PushToggle`).
  - `sw.js` gets a `fetch` handler limited to same-origin GET requests:
    - navigations to `/games` and `/games/imposter`: network first, cached copy when offline;
    - `/_next/static/*`: cache first (file names are content-hashed);
    - everything else: not touched.
  - `install` precaches `/games` and `/games/imposter`; `activate` deletes caches from older
    versions (versioned cache name).
  - Links between the two games pages are plain `<a>` tags, so an offline navigation is a full
    page load the service worker can answer, not a client-side RSC fetch it cannot.
  - The games pages do not call `useSession`, so being offline never redirects to sign-in.

## Error handling

- Setup errors from `validateSetup` are shown inline; **Start** is disabled until none remain.
- Corrupt or old saved settings fall back to defaults.
- A category with no unused words left resets its used set instead of failing.

## Testing

- `src/lib/imposter.test.ts` (root vitest, node): `maxImposters` bounds, every `validateSetup`
  error, `dealRound` with a seeded rng (right number of imposters, imposter cards per mode, no
  repeated word, used-set reset, starter in range), `tallyVotes` (clear accuse, wrong accuse,
  tie), `applyScore`.
- Word data test: every entry has non-empty `tr` and `en` word and pair, word ≠ pair, no
  duplicate words within a category per language.
- `src/sw.test.ts` extended: the fetch handler answers `/games` from cache when the network
  fails, caches `/_next/static/*`, ignores API and non-GET requests.
- i18n key parity is already covered by the existing i18n tests.
- Mobile: `tsc` and `npx expo export --platform android`; device check by the owner.
