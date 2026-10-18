import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { parseThemePref, type ThemePref } from "@ptracker/shared/theme";

// Same fail-soft shape as language-storage.ts: a read failure means "follow the device".

const THEME_KEY = "app_theme";

export async function getStoredTheme(): Promise<ThemePref> {
  try {
    return parseThemePref(await AsyncStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

export async function setStoredTheme(pref: ThemePref): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, pref);
  } catch {
    // Non-fatal: the choice applies now, it just will not survive a restart.
  }
}

// Overrides the app's appearance; NativeWind's dark palette and the navigation theme
// both follow it. "unspecified" hands control back to the device setting.
export function applyTheme(pref: ThemePref): void {
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}
