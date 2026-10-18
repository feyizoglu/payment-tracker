import { isDarkTheme, parseThemePref, type ThemePref } from "@/lib/theme-pref";

export const THEME_STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// Inlined into <head> so the class is set before first paint (no white flash on a dark
// page). It also keeps a "system" choice in step when the device switches while open.
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},m=matchMedia(${JSON.stringify(DARK_QUERY)});function a(){var p=localStorage.getItem(k);document.documentElement.classList.toggle("dark",p==="dark"||(p!=="light"&&m.matches))}a();m.addEventListener("change",a)}catch(e){}})()`;

export function readThemePref(): ThemePref {
  try {
    return parseThemePref(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies to this page.
  }
  document.documentElement.classList.toggle("dark", isDarkTheme(pref, matchMedia(DARK_QUERY).matches));
}
