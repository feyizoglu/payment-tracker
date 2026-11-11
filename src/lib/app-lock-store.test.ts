import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { APP_LOCK_KEY, EMPTY_LOCK } from "@/lib/app-lock";
import { clearLock, randomSalt, readLockRaw, sha256Hex, subscribeLock, writeLock } from "@/lib/app-lock-store";

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app lock store", () => {
  it("hashes with SHA-256 as lowercase hex", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("makes a 16-byte hex salt that differs each time", () => {
    const a = randomSalt();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSalt()).not.toBe(a);
  });

  it("writes, reads, clears and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLock(listener);
    writeLock({ ...EMPTY_LOCK, pinHash: "h", salt: "s" });
    expect(JSON.parse(store[APP_LOCK_KEY]).pinHash).toBe("h");
    expect(readLockRaw()).toBe(store[APP_LOCK_KEY]);
    clearLock();
    expect(readLockRaw()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    writeLock(EMPTY_LOCK);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("survives a storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readLockRaw()).toBeNull();
    expect(() => writeLock(EMPTY_LOCK)).not.toThrow();
    expect(() => clearLock()).not.toThrow();
  });
});
