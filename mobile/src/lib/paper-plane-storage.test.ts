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
import { getStoredPlaneBest, setStoredPlaneBest } from "@/lib/paper-plane-storage";

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe("paper plane best score", () => {
  it("reads back what was saved", async () => {
    await setStoredPlaneBest(12);
    expect(await getStoredPlaneBest()).toBe(12);
  });

  it("reads 0 when nothing or something wrong is saved, and null when storage fails", async () => {
    expect(await getStoredPlaneBest()).toBe(0);
    store.map.set("paper-plane-best", "nope");
    expect(await getStoredPlaneBest()).toBe(0);
    store.fail = true;
    expect(await getStoredPlaneBest()).toBeNull();
    await expect(setStoredPlaneBest(3)).resolves.toBeUndefined();
  });
});
