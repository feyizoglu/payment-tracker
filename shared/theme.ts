export type ThemePref = "system" | "light" | "dark";

export const THEME_PREFS: readonly ThemePref[] = ["system", "light", "dark"];

// Storage can hold an older or corrupted value; anything unknown means "follow the device".
export function parseThemePref(value: unknown): ThemePref {
  return value === "light" || value === "dark" ? value : "system";
}

export function isDarkTheme(pref: ThemePref, deviceIsDark: boolean): boolean {
  return pref === "dark" || (pref === "system" && deviceIsDark);
}
