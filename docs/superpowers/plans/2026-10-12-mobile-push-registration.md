# Mobile push registration (Plan 4b)

## Context
The server half of push notifications is already live (Plan 1):
- `POST /api/devices` (`src/app/api/devices/route.ts`) upserts `{ expo_push_token, platform }` for the caller.
- `/api/cron/send-reminders` runs daily at 12:00 UTC (`vercel.json`). It emails, and also sends an Expo push to every registered device of the user whose payments fall due tomorrow (`route.ts:96-132`; title "Ödeme Hatırlatıcısı", `data.month`).

What's missing is the device half. The app never asks for notification permission, never gets an Expo push token and never calls `/api/devices`, so the `devices` table is empty. Android also needs FCM credentials before Expo can deliver anything.

Branch: `feature/mobile-push` (off `feature/mobile-ui-polish`, so the preview APK carries both).

## Steps

1. **Firebase / FCM. The user does this in the browser and in their own terminal.**
   - In the Firebase console, create a project and add an Android app with package `com.tolgahan.paymenttracker`. Download `google-services.json` into `mobile/`.
   - In Firebase, go to Project settings → Service accounts → Generate new private key. Upload it with `eas credentials` → Android → production → Google Service Account → "Push Notifications (FCM V1)". The same credential serves every build profile.
   - The service-account JSON is a secret: never put it in the repo. `google-services.json` is client config and may be committed. The repo is personal; confirm with the user whether it is public, and if so pass it as an EAS file env var instead.

2. **App config** (`mobile/app.json`)
   - Set `android.googleServicesFile: "./google-services.json"`.
   - Configure the `expo-notifications` plugin, which is already listed (icon: a white monochrome glyph, reusing `android-icon-monochrome.png`; color `#2563EB`).
   - Read the v57 `expo-notifications` docs first.

3. **Registration logic** (`mobile/src/lib/push.ts`, unit-tested)
   - `registerForPush(api)`:
     - create the Android channel `default`;
     - request permission (the Android 13+ `POST_NOTIFICATIONS` prompt);
     - on grant, call `getExpoPushTokenAsync({ projectId })` with the projectId from `Constants.expoConfig.extra.eas.projectId`;
     - `POST /api/devices` with `{ expo_push_token, platform: "android" }`.
   - The decision logic (permission state, then token, then request body) is pure and tested. Expo calls are injected, the same pattern as `exchangeGoogleIdToken`.
   - Call it from `auth-context` once `isAuthenticated` is true, once per app start. A failure is logged and ignored, never blocking the UI. A denied permission is not asked again on every start.

4. **Tapping a notification** opens the Payments tab on `data.month`. Use `useLastNotificationResponse` in the root layout, then `router.push`. If the Payments tab cannot take a month param, open the tab only and leave month selection for later.

5. **Sign-out.** Today the token stays registered, so a signed-out phone keeps receiving reminders. Add `DELETE /api/devices` (body `{ expo_push_token }`, deletes only the caller's own row; tested next to the POST tests) and call it from `signOut` before clearing the JWT. This is a small API addition; the user approves it with this plan.

## Verification
- `npm test` at the root (API) and `npx tsc --noEmit`, `npx vitest run`, `npx expo export --platform android` in `mobile/`.
- A native rebuild is required (`google-services.json` and plugin config): use the preview APK build (`eas build -p android --profile preview`, after the env fix in `eas.json`).
- On the device: sign in, accept the prompt, and check that a row appears in Supabase `devices`. Send a test message to the token at https://expo.dev/notifications and check that it arrives and that tapping it opens the app. Then add a payment due tomorrow and wait for the 12:00 UTC cron, or call the cron route by hand with its secret.
