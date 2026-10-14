# Mobile UI polish (pre-store)

## Context
The mobile app still ships Expo scaffold branding: the default Expo app icon, adaptive icon and splash, an animated splash that shows `expo-logo.png`, and four tabs that reuse two template tab icons (`home.png` / `explore.png`). These must go before an Internal testing upload. The web app already has a brand icon (`src/app/icon.svg`: blue `#2563EB` badge, white calendar, amber coin), which the mobile app reuses.

Order after this plan: push notifications (registration), then Play Internal testing.

Branch: `feature/mobile-ui-polish`.

## Steps

1. **Brand assets from `src/app/icon.svg`**
   - Write a one-off render script in `/tmp` (not in the repo, no new dependency) using `@resvg/resvg-js` via a temp install. It produces:
     - `mobile/assets/images/icon.png`: 1024×1024, full badge.
     - `android-icon-foreground.png`: 1024×1024 transparent, calendar and coin only, scaled to sit inside the 66% adaptive safe zone.
     - `android-icon-background.png`: 1024×1024 solid `#2563EB`.
     - `android-icon-monochrome.png`: white silhouette of the foreground.
     - `splash-icon.png`: the foreground glyph.
     - `favicon.png`: 48×48.
   - In `mobile/app.json`, set the splash `backgroundColor` and adaptive icon `backgroundColor` to `#2563EB`.
   - Check `mobile/assets/expo.icon` (iOS icon bundle). Android ignores it, so either remove it from `app.json` or leave it; decide when reading the config.

2. **Animated splash** (`src/components/animated-icon.tsx`)
   - Swap `expo-logo.png` for the new `splash-icon.png`, and use the brand blue in place of the template colors in `animated-icon.module.css` / the native styles, so the native splash hands off to the overlay without a color jump.

3. **Tab icons** (`src/components/app-tabs.tsx`)
   - Replace the `src` PNGs with Android Material Symbols through the `md` prop of `NativeTabs.Trigger.Icon` (supported in SDK 57; `expo-symbols` is already a dependency). Read the v57 NativeTabs docs first.
   - Ödemeler `event`, Ekonomi `account_balance_wallet`, Raporlar `bar_chart`, Ayarlar `settings`.
   - Remove the now-wrong "reuses the scaffold's explore icon" comment.

4. **Remove scaffold leftovers**
   - Delete `src/components/web-badge.tsx` (and `app-tabs.web.tsx` / `animated-icon.web.tsx` if nothing imports them), `assets/images/{react-logo*.png,expo-logo.png,expo-badge*.png,logo-glow.png,tutorial-web.png}` and `assets/images/tabIcons/`.
   - Grep before each delete; keep anything still referenced.

5. **Dark mode pass (device check, fix only what breaks)**
   - Open the four tabs and the forms in dark mode on the device. Known hardcoded colors: placeholder `#9ca3af` (`text-field.tsx`, `amount-lines.tsx`) and link `#3c87f7` (`themed-text.tsx`). Move them to `constants/theme.ts` only if they read badly in dark mode.

## Round 2: device feedback (2026-10-12)

The user checked the app on the device (phone in system dark mode) and reported three problems.

6. **Top safe area.** No screen handles insets (no `SafeAreaView` or `useSafeAreaInsets` anywhere), so content runs under the status bar. Add a top inset to the four tab screens (`src/app/(app)/*.tsx`) with `react-native-safe-area-context` (already an Expo dependency; verify). The modal routes draw `form-screen.tsx`, so check that header too. Add `expo-status-bar` `<StatusBar style="auto" />` in the root layout so status bar icons follow the theme.

7. **Per-person colors (web parity).** Web builds a `userMap` (`src/app/dashboard/page.tsx:86`: session user + team members, `color ?? hashColor(id)`) and uses it for:
   - a 3px left border on payment cards in the owner's color, plus a colored owner dot (`PaymentCard.tsx:73,96`, `CalendarView.tsx:307,344`);
   - calendar day dots in the owner's color, or `#86EFAC` when paid (`CalendarView.tsx:252`).

   Mobile has none of this, and `asset-row.tsx:45` uses `hashColor` only, which ignores the color picked in Settings.
   - Add a pure `buildUserMap` / `userColor` to `mobile/src/lib/` (unit-tested), reusing `hashColor` from `@ptracker/shared/economy`.
   - Build the map from `fetchProfile` user + teams (the same data the Settings tab loads).
   - Apply it in `occurrence-row.tsx`, `payments-calendar.tsx` (dots) and `asset-row.tsx`.

8. **Manual gold entry always visible.** Web always shows the "Altını manuel gir" button (`src/app/economy/page.tsx:298`). Mobile shows it only when `banner.goldError` is set (`economy.tsx:141`). Show it always, next to "Kurları Güncelle". There is no manual USD/EUR/GBP rate on web either; out of scope.

9. **Dark mode support.** The user chose full dark mode. Today the tab bar follows the system theme (`Colors[scheme]`) while every screen hardcodes light NativeWind classes: about 124 color classes in 28 files, mostly `bg-white`, `text-gray-400/500/900` and `border-gray-100`.
   - Add semantic tokens to `tailwind.config.js` (`surface`, `surface-muted`, `fg`, `fg-muted`, `fg-subtle`, `line`) backed by CSS variables that switch with the color scheme. Read the NativeWind v4 dark-mode / CSS-variables docs first and pick the mechanism it supports on native.
   - Replace the gray and white classes with these tokens file by file. Status colors (green paid, red delete, amber gold, emerald total card) get `dark:` variants.
   - Non-class colors: `constants/theme.ts`, `placeholderTextColor`, `ActivityIndicator`, `RefreshControl` and the datetimepicker `themeVariant` follow the scheme.
   - Keep `userInterfaceStyle: automatic`.

Order: 6, 8, 7, 9. Steps 6-8 are one commit each. Step 9 is its own commit, verified on the device in both themes.

## Verification
- `npx tsc --noEmit` and `npx vitest run` in `mobile/`.
- `npx expo export --platform android` (the only check that catches Metro bundling issues).
- Device: rebuild the dev client (icon and splash changes are native, so `eas build --profile development` or a local `npx expo run:android` is needed, not just Metro reload). Check the launcher icon (including the themed icon on Android 13+), splash, the four tab icons, and light and dark mode.
- Push the feature branch through `/push-gate:push`, then merge into `main`.
