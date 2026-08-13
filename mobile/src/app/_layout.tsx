import '../../tailwind.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { LanguageProvider, type Lang } from '@ptracker/shared/i18n';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { getStoredLanguage, setStoredLanguage } from '@/lib/language-storage';

SplashScreen.preventAutoHideAsync();

// Auth-gated navigator. Expo Router requires the root layout to render a
// navigator, so gating is done with Stack.Protected guards rather than by
// conditionally rendering a screen component.
function RootNavigator() {
  const { ready, isAuthenticated } = useAuth();

  // While the stored token is being restored, render nothing — the animated
  // splash overlay covers the screen until `ready` flips.
  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
        {/* Write flows live at the root, as siblings of the tab group, so they can
            cover the tabs. Each screen draws its own header via <FormScreen>, which
            is why headerShown stays false. */}
        <Stack.Screen name="payment-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="occurrence-edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="payment/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recurring/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="asset-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="asset/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="manual-gold" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

// The saved language has to be read before the provider mounts: LanguageProvider takes
// its language as an initial value, so hydrating afterwards would flash the default
// language first. Turkish is the fallback — the app shipped Turkish-only until now.
function LanguageGate({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang | null>(null);

  useEffect(() => {
    getStoredLanguage().then((stored) => setLang(stored ?? 'tr'));
  }, []);

  if (!lang) return <View className="flex-1 bg-white" />;

  return (
    <LanguageProvider initialLang={lang} onLangChange={setStoredLanguage}>
      {children}
    </LanguageProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <LanguageGate>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </ThemeProvider>
      </LanguageGate>
    </AuthProvider>
  );
}
