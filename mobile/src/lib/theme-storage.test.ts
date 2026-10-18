import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  },
}));
vi.mock("react-native", () => ({ Appearance: { setColorScheme: vi.fn() } }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import { applyTheme, getStoredTheme, setStoredTheme } from "./theme-storage";

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("theme storage", () => {
  it("round-trips a saved choice", async () => {
    await setStoredTheme("dark");
    expect(await getStoredTheme()).toBe("dark");
  });

  it("follows the device when nothing or something unknown is saved", async () => {
    expect(await getStoredTheme()).toBe("system");
    store.set("app_theme", "sepia");
    expect(await getStoredTheme()).toBe("system");
  });

  it("follows the device when storage fails", async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("io"));
    expect(await getStoredTheme()).toBe("system");
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("io"));
    await expect(setStoredTheme("light")).resolves.toBeUndefined();
  });
});

describe("applyTheme", () => {
  it("forces light or dark and hands system back to the device", () => {
    applyTheme("dark");
    applyTheme("light");
    applyTheme("system");
    expect(vi.mocked(Appearance.setColorScheme).mock.calls).toEqual([["dark"], ["light"], ["unspecified"]]);
  });
});
