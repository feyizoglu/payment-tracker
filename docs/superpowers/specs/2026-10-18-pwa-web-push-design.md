# Installable web app with push reminders

## Goal

The web app can be installed from mobile Chrome (and Safari on iOS 16.4+) as an app with its own icon, and sends the daily payment reminders as web push notifications, alongside the existing e-mail and Expo pushes.

## Approach

`web-push` (npm) with VAPID keys and a hand-written service worker, as in the Next.js PWA guide (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`). No Firebase or third-party push service.

## Installable app

- `src/app/manifest.ts` (Next.js metadata route): name "PayTrack", short name "PayTrack", `start_url: "/dashboard"`, `display: "standalone"`, theme and background colours matching the app's blue (`#2563EB`) and white, icons 192x192 and 512x512 PNG (plus a maskable 512) generated once from `src/app/icon.svg` into `public/icons/`.
- `public/sw.js`: handles `push` (show a notification from the JSON payload `{ title, body, url }`) and `notificationclick` (focus an open tab on that URL or open a new window). No offline caching.
- `next.config.ts` headers for `/sw.js`: `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Security-Policy: default-src 'self'; script-src 'self'`.

## Subscriptions

- Table `web_push_subscriptions`: `id`, `user_id` → users (cascade), `endpoint` text unique not null, `p256dh` text not null, `auth` text not null, `created_at`. RLS enabled with no policies (service role only).
- `POST /api/web-push` body `{ endpoint, keys: { p256dh, auth } }`: session required; validates an `https:` endpoint and non-empty keys; upserts on `endpoint`, moving the row to the caller if another user had it (same rule as `/api/devices`).
- `DELETE /api/web-push` body `{ endpoint }`: deletes the caller's row for that endpoint.
- Client (`src/components/PushToggle.tsx`), a bell button in the dashboard, economy and events headers:
  - hidden when `serviceWorker`, `PushManager` or `Notification` is missing;
  - on iOS Safari not running standalone, shows a hint to add the site to the home screen first;
  - otherwise registers `/sw.js`, shows on/off state from `pushManager.getSubscription()`, subscribes with `NEXT_PUBLIC_VAPID_PUBLIC` on click (after `Notification.requestPermission()`), and unsubscribes plus `DELETE` on a second click.
- Sign-out on the web unsubscribes this browser and deletes its row before signing out (best effort).

## Sending

- `src/lib/web-push.ts`: `sendWebPush(subscriptions, payload)` wraps `web-push` (`setVapidDetails` from `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC`, `VAPID_PRIVATE_KEY`), returns `{ sent, expiredEndpoints, errors }`; a 404 or 410 from the push service marks the endpoint expired. Missing VAPID env: send nothing and report one error, never throw.
- `/api/cron/send-reminders`: after the Expo step, loads `web_push_subscriptions` for the users with reminders, sends the same title and body with `url: "/dashboard?month=yyyy-MM"` for tomorrow's month, deletes expired endpoints, and adds a `webPush` summary to the response.
- The dashboard reads `?month=yyyy-MM` (if it does not already) to open on that month.

## Configuration (owner)

- Generate keys once: `npx web-push generate-vapid-keys`.
- Vercel env (Production and Preview): `NEXT_PUBLIC_VAPID_PUBLIC`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:<owner e-mail>`; same in local `.env.local` for testing.
- Run the new table's SQL in Supabase.

## Testing

- Unit (vitest): `/api/web-push` POST/DELETE (auth, validation, upsert, delete scoped to caller); `sendWebPush` (success, 410 expiry, missing env) with `web-push` mocked; cron web-push step (only due users, expired cleanup); manifest shape.
- Manual: install from mobile Chrome, enable notifications, trigger the cron with the secret, receive and tap the notification.

## Out of scope

- Offline caching.
- Event-split notifications.
- Mobile app changes.
