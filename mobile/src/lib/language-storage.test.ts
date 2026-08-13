import { describe, it, expect, vi, beforeEach } from "vitest";

// AsyncStorage is a native module, so it is mocked here: these tests are about the
// fail-soft contract of the language reader/writer, not about the store itself.
const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { parseLang, getStoredLanguage, setStoredLanguage } from "@/lib/language-storage";

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("parseLang", () => {
  it("accepts the two supported languages", () => {
    expect(parseLang("tr")).toBe("tr");
    expect(parseLang("en")).toBe("en");
  });

  it("rejects anything else so a bad value cannot reach the dictionary", () => {
    // A stored "de" would index translations["de"] and render undefined everywhere.
    expect(parseLang("de")).toBeNull();
    expect(parseLang("")).toBeNull();
    expect(parseLang("TR")).toBeNull();
    expect(parseLang(null)).toBeNull();
  });
});

describe("getStoredLanguage", () => {
  it("returns the stored language", async () => {
    getItem.mockResolvedValue("tr");
    expect(await getStoredLanguage()).toBe("tr");
  });

  it("reads the app_language key", async () => {
    getItem.mockResolvedValue("en");
    await getStoredLanguage();
    expect(getItem).toHaveBeenCalledWith("app_language");
  });

  it("returns null on a first launch with nothing stored", async () => {
    getItem.mockResolvedValue(null);
    expect(await getStoredLanguage()).toBeNull();
  });

  it("returns null for an unsupported stored value instead of passing it through", async () => {
    getItem.mockResolvedValue("de");
    expect(await getStoredLanguage()).toBeNull();
  });

  it("returns null when storage rejects, so the LanguageGate falls back instead of crashing", async () => {
    getItem.mockRejectedValue(new Error("storage unavailable"));
    await expect(getStoredLanguage()).resolves.toBeNull();
  });

  it("returns null when storage throws synchronously", async () => {
    getItem.mockImplementation(() => {
      throw new Error("native module missing");
    });
    await expect(getStoredLanguage()).resolves.toBeNull();
  });
});

describe("setStoredLanguage", () => {
  it("writes the chosen language under the app_language key", async () => {
    setItem.mockResolvedValue(undefined);
    await setStoredLanguage("tr");
    expect(setItem).toHaveBeenCalledWith("app_language", "tr");
  });

  it("swallows a write failure: the choice applies now, it just will not survive a restart", async () => {
    setItem.mockRejectedValue(new Error("disk full"));
    await expect(setStoredLanguage("en")).resolves.toBeUndefined();
  });

  it("swallows a synchronous write failure", async () => {
    setItem.mockImplementation(() => {
      throw new Error("native module missing");
    });
    await expect(setStoredLanguage("en")).resolves.toBeUndefined();
  });
});
