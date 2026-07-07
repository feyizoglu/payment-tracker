import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { useAuth } from '@/lib/auth-context';
import { getGoogleClientId } from '@/lib/config';

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const { signInWithGoogleIdToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uses the web client id for both webClientId and (for now) androidClientId.
  // Plan 4 adds a dedicated Android client id once EAS produces a signing SHA-1.
  // NOTE: expo-auth-session's Google provider is deprecated in SDK 57 and the
  // native prompt only completes in an EAS dev build (Plan 4); in Expo Go the
  // button renders but the flow won't finish. The token-exchange it calls is
  // unit-tested (lib/auth.ts).
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: getGoogleClientId(),
    androidClientId: getGoogleClientId(),
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params?.id_token;
    if (!idToken) {
      setError('Google did not return an ID token');
      return;
    }
    setBusy(true);
    setError(null);
    signInWithGoogleIdToken(idToken)
      .catch((e) => setError(e instanceof Error ? e.message : 'Sign-in failed'))
      .finally(() => setBusy(false));
  }, [response, signInWithGoogleIdToken]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white p-6">
      <Text className="text-2xl font-semibold text-black">Payment Tracker</Text>
      {busy ? (
        <ActivityIndicator />
      ) : (
        <Pressable
          disabled={!request}
          onPress={() => promptAsync()}
          className="rounded-lg bg-brand px-6 py-3 disabled:opacity-50">
          <Text className="font-medium text-brand-fg">Google ile giriş yap</Text>
        </Pressable>
      )}
      {error ? <Text className="text-red-600">{error}</Text> : null}
    </View>
  );
}
