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
import { getStoredHuntBest, setStoredHuntBest } from "@/lib/bill-hunt-storage";

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe("bill hunt best score", () => {
  it("reads back what was saved under its own key", async () => {
    await setStoredHuntBest(12);
    expect(store.map.get("bill-hunt-best")).toBe("12");
    expect(await getStoredHuntBest()).toBe(12);
  });

  it("reads 0 when nothing or something wrong is saved, and null when storage fails", async () => {
    expect(await getStoredHuntBest()).toBe(0);
    store.map.set("bill-hunt-best", "nope");
    expect(await getStoredHuntBest()).toBe(0);
    store.fail = true;
    expect(await getStoredHuntBest()).toBeNull();
    await expect(setStoredHuntBest(3)).resolves.toBeUndefined();
  });
});
