import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import { useLang } from '@ptracker/shared/i18n';

import { useAuth } from '@/lib/auth-context';
import { getGoogleClientId } from '@/lib/config';

// `webClientId` must be the WEB OAuth client — the id_token it mints carries
// that client as its audience, which is exactly what the backend allowlists
// (AUTH_GOOGLE_ID, see src/lib/mobile-auth.ts). The Android OAuth client only
// has to exist in the same Google project (package + signing SHA-1); its id is
// never referenced here.
//
// Configured lazily rather than at module load so a missing env var surfaces as
// an error banner on the button instead of crashing the route on import.
let configured = false;
function configureOnce() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: getGoogleClientId() });
  configured = true;
}

export default function SignIn() {
  const { t } = useLang();
  const { signInWithGoogleIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPress() {
    setBusy(true);
    setError(null);
    try {
      configureOnce();
      await GoogleSignin.hasPlayServices();
      const res = await GoogleSignin.signIn();
      // The user dismissing the account chooser is not an error — leave the
      // screen exactly as it was.
      if (res.type !== 'success') return;
      if (!res.data.idToken) {
        setError(t.signInNoIdToken);
        return;
      }
      await signInWithGoogleIdToken(res.data.idToken);
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return;
      setError(e instanceof Error ? e.message : t.signInFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-surface p-6">
      <Text className="text-2xl font-semibold text-gray-900">Payment Tracker</Text>
      {busy ? (
        <ActivityIndicator />
      ) : (
        <Pressable onPress={onPress} className="rounded-lg bg-brand px-6 py-3">
          <Text className="font-medium text-brand-fg">{t.signIn}</Text>
        </Pressable>
      )}
      {error ? <Text className="text-red-600">{error}</Text> : null}
    </View>
  );
}
