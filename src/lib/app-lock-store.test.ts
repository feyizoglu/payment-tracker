import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { APP_LOCK_KEY, EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";
import { randomSalt, readLockRaw, sha256Hex, subscribeLock, useAppLock, writeLock } from "@/lib/app-lock-store";

let store: Record<string, string>;

function workingStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
}

beforeEach(() => {
  store = {};
  workingStorage();
  vi.stubGlobal("window", { HTMLIFrameElement: class {}, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  writeLock(EMPTY_LOCK);
  store = {};
});

function blockedStorage(get: () => string | null = () => {
  throw new Error("blocked");
}) {
  vi.stubGlobal("localStorage", {
    getItem: get,
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  });
}

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

  it("reads nothing before a lock was written", () => {
    expect(readLockRaw()).toBeNull();
  });

  it("writes, reads and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLock(listener);
    writeLock({ ...EMPTY_LOCK, pinHash: "h", salt: "s" });
    expect(JSON.parse(store[APP_LOCK_KEY]).pinHash).toBe("h");
    expect(readLockRaw()).toBe(store[APP_LOCK_KEY]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeLock(EMPTY_LOCK);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("survives a storage that throws", () => {
    blockedStorage();
    expect(readLockRaw()).toBeNull();
    expect(() => writeLock(EMPTY_LOCK)).not.toThrow();
  });

  it("keeps the lock in memory for this page when storage is blocked, until storage takes a write again", () => {
    blockedStorage();
    const state = { ...EMPTY_LOCK, pinHash: "h", salt: "s", gameMode: true };
    writeLock(state);
    expect(JSON.parse(readLockRaw()!)).toEqual(state);
    workingStorage();
    writeLock({ ...state, gameMode: false });
    expect(readLockRaw()).toBe(store[APP_LOCK_KEY]);
    expect(JSON.parse(store[APP_LOCK_KEY]).gameMode).toBe(false);
  });

  it("prefers the in-memory lock when only writing fails", () => {
    store[APP_LOCK_KEY] = JSON.stringify({ ...EMPTY_LOCK, pinHash: "old", salt: "s" });
    blockedStorage((() => store[APP_LOCK_KEY]) as () => string);
    writeLock({ ...EMPTY_LOCK, pinHash: "new", salt: "s", gameMode: true });
    expect(JSON.parse(readLockRaw()!).pinHash).toBe("new");
  });

  it("re-reads the lock when the page is restored from the back/forward cache", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLock(listener);
    const add = vi.mocked(window.addEventListener);
    const call = add.mock.calls.find(([type]) => type === "pageshow");
    expect(call).toBeDefined();
    (call![1] as () => void)();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(window.removeEventListener).toHaveBeenCalledWith("pageshow", call![1]);
  });
});

describe("useAppLock", () => {
  interface Root {
    render(node: unknown): void;
    unmount(): void;
  }
  const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
    createRoot: (container: unknown) => Root;
  };

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const seen: (AppLockState | null)[] = [];
  let root: Root | null = null;

  function Probe() {
    seen.push(useAppLock());
    return null;
  }

  function container() {
    const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
    return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
  }

  beforeEach(() => {
    seen.length = 0;
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
  });

  it("is null on the server, where the storage cannot be read", () => {
    store[APP_LOCK_KEY] = JSON.stringify({ ...EMPTY_LOCK, pinHash: "h", salt: "s" });
    renderToStaticMarkup(createElement(Probe));
    expect(seen).toEqual([null]);
  });

  it("returns the parsed stored lock in the browser and follows later writes", async () => {
    const stored = { ...EMPTY_LOCK, pinHash: "h", salt: "s", economyLock: true };
    store[APP_LOCK_KEY] = JSON.stringify(stored);
    root = createRoot(container());
    await act(async () => root?.render(createElement(Probe)));
    expect(seen.at(-1)).toEqual(stored);

    const renders = seen.length;
    await act(async () => writeLock({ ...stored, gameMode: true }));
    expect(seen.length).toBeGreaterThan(renders);
    expect(seen.at(-1)).toEqual({ ...stored, gameMode: true });
  });

  it("returns the empty lock when nothing is stored", async () => {
    root = createRoot(container());
    await act(async () => root?.render(createElement(Probe)));
    expect(seen.at(-1)).toEqual(EMPTY_LOCK);
  });
});
