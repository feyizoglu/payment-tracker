import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import vm from "node:vm";
import { isDarkTheme, parseThemePref } from "./theme-pref";
import { THEME_INIT_SCRIPT, readThemePref, setThemePref } from "./theme";

function fakeBrowser(stored: string | null, deviceDark: boolean) {
  const store = new Map<string, string>(stored === null ? [] : [["theme", stored]]);
  const classes = new Set<string>();
  let onChange: (() => void) | null = null;
  const media = {
    matches: deviceDark,
    addEventListener: (_: string, fn: () => void) => {
      onChange = fn;
    },
  };
  return {
    classes,
    media,
    fireChange: () => onChange?.(),
    globals: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      matchMedia: () => media,
      document: {
        documentElement: {
          classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
        },
      },
    },
    store,
  };
}

describe("parseThemePref / isDarkTheme", () => {
  it("falls back to system for unknown values", () => {
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("light")).toBe("light");
    expect(parseThemePref("blue")).toBe("system");
    expect(parseThemePref(null)).toBe("system");
  });

  it("follows the device only for system", () => {
    expect(isDarkTheme("system", true)).toBe(true);
    expect(isDarkTheme("system", false)).toBe(false);
    expect(isDarkTheme("light", true)).toBe(false);
    expect(isDarkTheme("dark", false)).toBe(true);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  const run = (b: ReturnType<typeof fakeBrowser>) => vm.runInNewContext(THEME_INIT_SCRIPT, b.globals);

  it("adds the dark class for a saved dark choice on a light device", () => {
    const b = fakeBrowser("dark", false);
    run(b);
    expect(b.classes.has("dark")).toBe(true);
  });

  it("keeps a saved light choice light on a dark device", () => {
    const b = fakeBrowser("light", true);
    run(b);
    expect(b.classes.has("dark")).toBe(false);
  });

  it("follows the device without a saved choice, including later switches", () => {
    const b = fakeBrowser(null, true);
    run(b);
    expect(b.classes.has("dark")).toBe(true);
    b.media.matches = false;
    b.fireChange();
    expect(b.classes.has("dark")).toBe(false);
  });

  it("does not throw when storage is blocked", () => {
    const b = fakeBrowser(null, false);
    b.globals.localStorage.getItem = () => {
      throw new Error("SecurityError");
    };
    expect(() => run(b)).not.toThrow();
  });
});

describe("readThemePref / setThemePref", () => {
  let b: ReturnType<typeof fakeBrowser>;

  beforeEach(() => {
    b = fakeBrowser(null, false);
    for (const [k, v] of Object.entries(b.globals)) vi.stubGlobal(k, v);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stores dark and applies it at once", () => {
    setThemePref("dark");
    expect(b.store.get("theme")).toBe("dark");
    expect(b.classes.has("dark")).toBe(true);
    expect(readThemePref()).toBe("dark");
  });

  it("forgets the choice for system and follows the device", () => {
    setThemePref("dark");
    b.media.matches = false;
    setThemePref("system");
    expect(b.store.has("theme")).toBe(false);
    expect(b.classes.has("dark")).toBe(false);
    expect(readThemePref()).toBe("system");
  });
});
