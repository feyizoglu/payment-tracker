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
import { getStoredBest, setStoredBest } from "@/lib/best-storage";

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe("stored best", () => {
  it("keeps each key's best apart", async () => {
    await setStoredBest("a", 12);
    await setStoredBest("b", 3);
    expect(await getStoredBest("a")).toBe(12);
    expect(await getStoredBest("b")).toBe(3);
    expect(await getStoredBest("c")).toBe(0);
  });

  it("reads null when storage fails, and a failed save does not throw", async () => {
    store.fail = true;
    expect(await getStoredBest("a")).toBeNull();
    await expect(setStoredBest("a", 3)).resolves.toBeUndefined();
  });
});
