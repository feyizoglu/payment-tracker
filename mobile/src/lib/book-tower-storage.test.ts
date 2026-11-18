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
import { getStoredTowerBest, setStoredTowerBest } from "@/lib/book-tower-storage";

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe("book tower best score", () => {
  it("reads back what was saved", async () => {
    await setStoredTowerBest(12);
    expect(await getStoredTowerBest()).toBe(12);
  });

  it("reads 0 when nothing or something wrong is saved, and null when storage fails", async () => {
    expect(await getStoredTowerBest()).toBe(0);
    store.map.set("book-tower-best", "nope");
    expect(await getStoredTowerBest()).toBe(0);
    store.fail = true;
    expect(await getStoredTowerBest()).toBeNull();
    await expect(setStoredTowerBest(3)).resolves.toBeUndefined();
  });
});
