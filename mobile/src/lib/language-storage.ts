import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@ptracker/shared/i18n";

// Persists the chosen language so the app does not reset to the default on every
// launch. Same fail-soft shape as economy-storage.ts: a read failure just means the
// default language, never a screen that will not open.

const LANGUAGE_KEY = "app_language";

// Narrow here rather than trusting storage: an older or corrupted value must not reach
// the dictionary lookup, which would render `undefined` for every string.
export function parseLang(value: string | null): Lang | null {
  return value === "tr" || value === "en" ? value : null;
}

export async function getStoredLanguage(): Promise<Lang | null> {
  try {
    return parseLang(await AsyncStorage.getItem(LANGUAGE_KEY));
  } catch {
    return null;
  }
}

export async function setStoredLanguage(lang: Lang): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // Non-fatal: the choice applies now, it just will not survive a restart.
  }
}
