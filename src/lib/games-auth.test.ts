import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GAMES_SIGNED_IN_KEY, gamesAccess, isRememberedSignedIn, rememberSignedIn } from "@/lib/games-auth";

describe("gamesAccess", () => {
  it("lets a signed-in user in", () => {
    expect(gamesAccess("authenticated", true, false)).toBe("allow");
    expect(gamesAccess("authenticated", false, false)).toBe("allow");
  });

  it("sends a signed-out user to sign in while online, even if this device was signed in before", () => {
    expect(gamesAccess("unauthenticated", true, true)).toBe("signin");
    expect(gamesAccess("unauthenticated", true, false)).toBe("signin");
  });

  it("waits for the session while online", () => {
    expect(gamesAccess("loading", true, true)).toBe("wait");
  });

  it("lets a device that was signed in before play offline", () => {
    expect(gamesAccess("unauthenticated", false, true)).toBe("allow");
    expect(gamesAccess("loading", false, true)).toBe("allow");
  });

  it("does not let a device that never signed in play offline", () => {
    expect(gamesAccess("unauthenticated", false, false)).toBe("signin");
    expect(gamesAccess("loading", false, false)).toBe("wait");
  });
});

describe("remembered sign-in", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores and clears the flag", () => {
    expect(isRememberedSignedIn()).toBe(false);
    rememberSignedIn(true);
    expect(store[GAMES_SIGNED_IN_KEY]).toBe("1");
    expect(isRememberedSignedIn()).toBe(true);
    rememberSignedIn(false);
    expect(isRememberedSignedIn()).toBe(false);
  });

  it("treats a storage error as not signed in", () => {
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
    expect(() => rememberSignedIn(true)).not.toThrow();
    expect(isRememberedSignedIn()).toBe(false);
  });
});
