import { describe, it, expect, vi, afterEach } from "vitest";
import { readSavedBest, writeSavedBest } from "@/lib/saved-best";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(store: Map<string, string>, fail = false) {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (fail) throw new Error("SecurityError");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (fail) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
  });
}

describe("saved best", () => {
  it("reads back what was saved under its key, and 0 for nothing or something wrong", () => {
    const store = new Map<string, string>();
    stubStorage(store);
    expect(readSavedBest("a")).toBe(0);
    writeSavedBest("a", 12);
    expect(store.get("a")).toBe("12");
    expect(readSavedBest("a")).toBe(12);
    expect(readSavedBest("b")).toBe(0);
    store.set("b", "nope");
    expect(readSavedBest("b")).toBe(0);
  });

  it("reads null and writes nothing when the browser refuses storage", () => {
    stubStorage(new Map(), true);
    expect(readSavedBest("a")).toBeNull();
    expect(() => writeSavedBest("a", 3)).not.toThrow();
  });
});
