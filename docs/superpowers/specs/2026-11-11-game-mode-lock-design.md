# Game mode lock and Economy PIN — design

Date: 2026-11-11. Branch `feature/game-mode-lock` (on top of `feature/imposter-game`).

## Goal

During pass-and-play games the phone is in other people's hands. They must only reach the
games, never payments, assets, reports, events or settings. One app PIN guards both the exit
from game mode and, optionally, every visit to Economy.

Out of scope here: fingerprint/face unlock, server-side locking, the Finance / Events /
Games navigation split (a later spec).

## Threat level

Screen-level lock on the device. It stops a curious person holding the phone; it does not
stop someone who opens the browser's developer tools on a signed-in session. The API is not
changed, so offline games keep working.

## PIN

- 4–6 digits, set per device. Stored as `sha256(salt + pin)` with a random 16-byte salt,
  never the PIN itself, never sent to the server.
  - Web: `localStorage` key `app_lock`.
  - Mobile: `expo-secure-store` key `app_lock` (hashing with `expo-crypto`; both are
    already installed, so this ships with `eas update`).
- Set / change / remove:
  - Web: a "PIN" item in the user menu next to the theme picker (dashboard, economy and the
    shared `EventsHeader` menus) opens a dialog.
  - Mobile: a "PIN" section in the Settings tab.
  - Changing or removing an existing PIN asks for the current PIN first.
- Option "Ask for the PIN when opening Economy" (off by default), shown once a PIN exists.

## Game mode

- Opening a games page turns game mode on. With no PIN yet, the games page first shows
  "Set a PIN for game mode" (PIN + repeat); the games stay closed until one is set.
- Game mode is saved with the PIN data, so a reload or an app restart stays locked.
- While game mode is on, only the games pages and the PIN screen are reachable:
  - Web: an `AppLockGate` client component in the root layout. On any signed-in path other
    than `/games*` it renders the PIN screen instead of the page, so typing a URL does not
    help. `/` (sign-in) stays reachable.
  - Mobile: the root `Stack.Protected` guards. App screens (tabs, forms, events) are
    guarded by `isAuthenticated && !gameMode`; the games screens by `isAuthenticated`; a
    new `app-lock` screen by `isAuthenticated && gameMode` for the exit flow. The Payments
    tab's games icon and the hardware back button therefore cannot leave the games.
- The games header gets an "Exit game mode" button: PIN screen → correct PIN turns game
  mode off and returns to the page the user came from (web: `/dashboard`; mobile: Payments).

## Economy PIN

When the option is on, every visit to Economy shows the PIN screen first:
- Web: `AppLockGate` for `/economy`; unlocked until the user leaves `/economy`.
- Mobile: the Economy tab content is wrapped in a gate that re-locks when the tab loses
  focus.

## Wrong PINs

After 5 wrong attempts the PIN screen refuses input for 30 s; each further wrong attempt
doubles the wait (60 s, 120 s, …, max 15 min). A correct PIN resets the counter. The
counter is saved, so a reload does not reset it.

## Forgot the PIN

Signing out and back in with Google is one tap on the owner's own phone, so neither a
sign-out nor "Forgot PIN" may remove the lock on the spot.

- "Forgot PIN" schedules a reset one hour ahead (`resetAt`). The lock stays on until then;
  the PIN screen shows when it will be removed and a "Cancel the reset" action. Entering the
  right PIN also cancels it. Once the hour has passed, the next PIN screen removes the whole
  lock (PIN, game mode, Economy option).
- The lock belongs to the device, not the session: sign-out keeps `app_lock` on both
  platforms. It is only removed with the current PIN (Remove PIN) or by the delayed reset.
- Limit: the delay follows the device clock, so moving the clock forward shortens it. That
  takes leaving the app for the system settings and is outside the threat level above.

## Architecture

- `shared/app-lock.ts` — pure, no platform APIs, no JSX:
  - `AppLockState` `{ pinHash, salt, economyLock, gameMode, failures, lockedUntil }` and
    `EMPTY_LOCK`.
  - `isValidPin(pin)`, `parseLockState(raw)` (corrupt data → `EMPTY_LOCK`).
  - `checkPin(state, pin, now, hash)` → `{ ok, state }` applying the wrong-PIN rules;
    `lockoutRemaining(state, now)`.
  - `setPin(state, pin, salt, hash)`, `clearPin`, `enterGameMode`, `exitGameMode`,
    `setEconomyLock`.
  - `hash` is injected (`(text) => Promise<string>`): Web Crypto `SHA-256` on the web,
    `expo-crypto` on mobile.
- Web: `src/lib/app-lock-storage.ts` (localStorage + Web Crypto), `src/components/lock/`
  (`AppLockGate`, `PinScreen`, `PinSetup`, `PinMenuItem`), wired in `src/app/layout.tsx`
  and the three user menus; games pages call `enterGameMode`.
- Mobile: `mobile/src/lib/app-lock-storage.ts` (SecureStore + expo-crypto), an
  `AppLockProvider` context, `mobile/src/app/app-lock.tsx`, `mobile/src/components/lock/*`,
  guards in `mobile/src/app/_layout.tsx`, a Settings section, an Economy gate.
- i18n: new keys in both `en` and `tr`.

## Testing

- `src/lib/app-lock.test.ts`: PIN format, parse fallbacks, correct / wrong PIN, lockout
  timing and doubling cap, reset on success, game mode and economy flags, clear.
- Storage helpers on both platforms: read/write/fail-soft with mocked storage.
- Web `AppLockGate` path rules as a pure function (`lockScreenFor(path, state, unlockedPath)`)
  tested in node.
- Mobile: `tsc` + `npx expo export --platform android`; device check by the owner.
