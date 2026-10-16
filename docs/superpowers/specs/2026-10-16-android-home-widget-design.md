# Android home screen widget: upcoming payments

## Goal

A home screen widget on Android that shows the payments still to pay, so the owner sees them without opening the app. View only: tapping opens the app; marking paid stays in the app.

## Content

- Unpaid occurrences only, from every payment the user can see (own and team), the same set the Payments tab lists.
- Order: overdue first (due date before today, shown in red), then due today through today + 7 days, each group sorted by due date ascending.
- Overdue looks back over the current and the previous month only; older unpaid items need the app.
- Up to 4 rows; anything beyond shows as a final "+N more" row.
- Each row: person colour strip on the left (`personColor` from `@/lib/people`), name, due date (`d MMM`, in the app language), amount with currency symbol (`—` when the amount is null).
- Header: "Upcoming payments" and the time of the last successful refresh.
- Empty states: "Nothing due in the next 7 days" when the list is empty; "Sign in" when there is no session.
- Texts come from `@ptracker/shared/i18n` in the language the app stored.

## Interaction

- Tapping a row opens the app on that occurrence's month through the app scheme URL `paymenttracker:///?month=yyyy-MM&tap=<timestamp>`. expo-router resolves it to the Payments tab with the same `month` and `tap` params a tapped reminder sets (`src/app/_layout.tsx`), so `src/app/(app)/index.tsx` needs no change.
- Tapping the header or an empty state opens the app.
- No mark-paid action on the widget.

## Architecture

Library: `react-native-android-widget` (Expo config plugin, widget UI written in JSX, a headless JS task handler for updates). `expo-widgets` is iOS-only and does not apply.

Units:

- `src/lib/widget-items.ts`: pure `selectWidgetItems(occurrences, today)` that returns `{ items, moreCount }`, the filter and order above. No I/O.
- `src/lib/widget-data.ts`: `loadWidgetData(deps)` that reads the JWT, fetches `/api/payments?filter=all`, `/api/recurring?filter=all` and `/api/teams` (team failure tolerated, as on the Payments tab), builds occurrences for the previous, current and next month with `getOccurrencesForMonth`, calls `selectWidgetItems`, and writes the result to a cache. Storage, fetch and clock are injected so it is unit-testable in node.
- `src/widget/upcoming-payments-widget.tsx`: the widget layout (library primitives, not React Native views).
- `src/widget/task-handler.tsx`: registered with `registerWidgetTaskHandler`; on `WIDGET_ADDED`, `WIDGET_UPDATE` and `WIDGET_RESIZED` runs `loadWidgetData` and renders.
- `src/lib/widget-refresh.ts`: `refreshWidget()` that calls `requestWidgetUpdate`; called by the app after the Payments tab loads data and after sign-out. Failures are swallowed.

## Data flow

1. Android asks for an update every 30 minutes (the platform minimum, `updatePeriodMillis`), and the app asks after each Payments load and on sign-out.
2. The task handler runs `loadWidgetData`: JWT from SecureStore through `getToken`, then the three GETs through `createApiClient` with no `onUnauthorized`.
3. On success the computed items and the refresh time are written to AsyncStorage under one key and rendered.

## Errors

- No JWT, or a 401: render "Sign in" and clear the cache, so a signed-out phone shows no payment data.
- Network or server error: render the cached items with their original refresh time; with no cache, render "Couldn't refresh" plus the open-app tap.
- The handler never throws to the native side.

## Release

- Native change: needs a new EAS build. Bump `expo.version` to `1.0.1` so the runtime version (`appVersion` policy) differs and no OTA update built for 1.0.0 reaches the new binary, or the reverse.
- The widget is registered through the library's config plugin in `app.json` (name, label, min size 4x2, resizable, 30-minute update period, preview image).

## Testing

- Unit (vitest): `selectWidgetItems` (overdue ordering, 7-day window edge at midnight, paid excluded, `moreCount`, null amount); `loadWidgetData` (no token, 401 clears cache, network error falls back to cache, team failure tolerated, success writes cache).
- Manual on the device: add the widget, check rows against the Payments tab, tap a row opens the right month, sign out shows "Sign in", airplane mode keeps the cached list.

## Out of scope

- Mark paid from the widget.
- iOS widget.
- Overdue items older than the previous month.
