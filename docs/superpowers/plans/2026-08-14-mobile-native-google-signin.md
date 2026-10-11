# Plan 4d — Native Google sign-in (@react-native-google-signin)

> Sub-plan of Plan 4. Replace the deprecated `expo-auth-session` Google flow (which fails with "Custom scheme URIs are not allowed for 'WEB' client type") with the native `@react-native-google-signin/google-signin` SDK, so sign-in actually completes in the dev build. Requires a **new EAS dev build** (new native module) and a Google Cloud **Android OAuth client**.

**Tech:** Expo SDK 57, `@react-native-google-signin/google-signin`. Read https://docs.expo.dev/versions/v57.0.0/ conventions (`mobile/AGENTS.md`).

**Work split:** Google Cloud clients + SHA-1 + the EAS build are run by the user (I cannot log into Google Cloud / Expo). Mobile code + config are written by me.

---

## Context

4a landed a working Android dev build; the app boots to the sign-in screen. Tapping Google fails because `sign-in.tsx` passes the **web** client id as `androidClientId` (`sign-in.tsx:27`) and the native redirect uses the custom scheme `paymenttracker://`, which a WEB-type client rejects. `expo-auth-session`'s Google provider is deprecated in SDK 57.

**Backend is already ready:** `src/lib/mobile-auth.ts:64-68` accepts any audience in `AUTH_GOOGLE_ID` + `GOOGLE_MOBILE_CLIENT_IDS`. With `@react-native-google-signin`, `configure({ webClientId })` mints an id_token whose **audience = the web client id**, which the backend already accepts as `AUTH_GOOGLE_ID`. **No backend code and no new audience env are needed.**

---

## Google Cloud + build prerequisites the USER runs (I guide)

- [ ] **U1 — SHA-1:** from `mobile/`, `eas credentials` → Android → the build credentials / keystore → copy the **SHA-1 Fingerprint** (this is the EAS-managed keystore used by the dev build, generated in 4a).
- [ ] **U2 — Android OAuth client:** Google Cloud Console → same project as the existing web client → APIs & Services → Credentials → Create credentials → OAuth client ID → Application type **Android** → package name `com.tolgahan.paymenttracker`, paste the SHA-1 → Create. (No client id value is used in code; the app is recognized by package + SHA-1.)
- [ ] **U3 — Web client id:** already exists (`AUTH_GOOGLE_ID` = current `EXPO_PUBLIC_GOOGLE_CLIENT_ID` in `mobile/.env`). This is the `webClientId`. No change.

## Mobile code I write

### Task 1 — install the SDK + config plugin
- `npx expo install @react-native-google-signin/google-signin` (from `mobile/`).
- Add to `mobile/app.json` `expo.plugins`: `"@react-native-google-signin/google-signin"` (bare — `iosUrlScheme` option is iOS-only; Android build ignores it).
- Verify: `npx tsc --noEmit` clean; `npx expo export --platform android` bundles.

### Task 2 — rewrite sign-in with GoogleSignin
- `mobile/src/app/sign-in.tsx`: drop `expo-auth-session`/`expo-web-browser`; use GoogleSignin. Configure once at module load with the web client id; button runs `hasPlayServices()` → `signIn()` → extract `response.data.idToken` → existing `signInWithGoogleIdToken(idToken)`.

```tsx
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getGoogleClientId } from '@/lib/config';

GoogleSignin.configure({ webClientId: getGoogleClientId() });

// onPress:
await GoogleSignin.hasPlayServices();
const res = await GoogleSignin.signIn();
if (res.type === 'success' && res.data.idToken) {
  await signInWithGoogleIdToken(res.data.idToken);
}
```
- Keep the existing error strings (`t.signInNoIdToken`, `t.signInFailed`); map `statusCodes.SIGN_IN_CANCELLED` to a silent no-op (no error banner on user cancel).

### Task 3 — sign out clears Google session
- In `mobile/src/lib/auth-context.tsx` `signOut`: also call `GoogleSignin.signOut()` (best-effort, wrapped so a failure doesn't block the local token clear), so the next sign-in shows the account chooser.

### Task 4 — verify (definition of done)
- `npx tsc --noEmit` clean AND `npx expo export --platform android` bundles (mandated mobile check).
- No new node-vitest logic to add (screen glue only; the id-token→backend exchange is already tested in `src/lib/auth.ts` tests). If any pure helper is extracted, unit-test it in `src/lib/`.

## Build + device test (USER)

- [ ] **U4 — new dev build:** `eas build --platform android --profile development` (new native module → must rebuild). Install the new APK.
- [ ] **U5 — run:** `npx expo start --dev-client`, open the app, tap Google → native account chooser → returns to app signed in → the four tabs load with real data from the Vercel API.

## Notes / risks

- New EAS build consumes build minutes (~5-15 min).
- `webClientId` MUST be the **Web** OAuth client id (not the Android one); the Android client only needs to exist with the matching package + SHA-1.
- If sign-in returns `DEVELOPER_ERROR`, the SHA-1 / package in the Android client don't match the keystore EAS built with — re-check U1/U2 against `eas credentials`.
- `expo-auth-session` stays installed (used only here previously); we simply stop importing its Google provider. Removing the dep is optional cleanup, deferred.
- Rollback: revert `sign-in.tsx` + `app.json` plugin + dep; the 4a dev build still runs (minus working login).
