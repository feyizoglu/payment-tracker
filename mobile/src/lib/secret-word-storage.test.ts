import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({ map: new Map<string, string>(), fail: false }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => {
      if (store.fail) throw new Error("disk");
      return store.map.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (store.fail) throw new Error("disk");
      store.map.set(k, v);
    },
  },
}));
import { getStoredSecretBest, getStoredSecretSeen, setStoredSecretBest, setStoredSecretSeen } from "@/lib/secret-word-storage";

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe("secret word storage", () => {
  it("reads back the best streak, 0 when none, and null when storage fails", async () => {
    expect(await getStoredSecretBest()).toBe(0);
    await setStoredSecretBest(6);
    expect(await getStoredSecretBest()).toBe(6);
    expect(store.map.get("secret-word-best")).toBe("6");
    store.fail = true;
    expect(await getStoredSecretBest()).toBeNull();
    await expect(setStoredSecretBest(3)).resolves.toBeUndefined();
  });

  it("keeps a seen list per language, empty when missing, broken or unreadable", async () => {
    await setStoredSecretSeen("tr", ["animals-1", "food-2"]);
    expect(await getStoredSecretSeen("tr")).toEqual(["animals-1", "food-2"]);
    expect(await getStoredSecretSeen("en")).toEqual([]);
    store.map.set("secret_word_seen_en", "{oops");
    expect(await getStoredSecretSeen("en")).toEqual([]);
    store.fail = true;
    expect(await getStoredSecretSeen("tr")).toEqual([]);
    await expect(setStoredSecretSeen("tr", [])).resolves.toBeUndefined();
  });
});
