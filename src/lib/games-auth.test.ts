import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  GAMES_SIGNED_IN_KEY,
  checkSession,
  gamesAccess,
  isRememberedSignedIn,
  needsSessionCheck,
  rememberSignedIn,
  type SessionCheck,
} from "@/lib/games-auth";

describe("gamesAccess", () => {
  const checks: SessionCheck[] = ["pending", "active", "none", "unreachable"];

  it("lets a signed-in user in whatever the network and the check say", () => {
    for (const check of checks) {
      expect(gamesAccess("authenticated", true, false, check)).toBe("allow");
      expect(gamesAccess("authenticated", false, false, check)).toBe("allow");
      expect(gamesAccess("authenticated", true, true, check)).toBe("allow");
    }
  });

  it("sends a device that was never signed in to sign in without waiting for a check", () => {
    for (const check of checks) {
      expect(gamesAccess("unauthenticated", true, false, check)).toBe("signin");
      expect(gamesAccess("unauthenticated", false, false, check)).toBe("signin");
    }
  });

  it("waits for the session while it is loading online", () => {
    for (const check of checks) {
      expect(gamesAccess("loading", true, true, check)).toBe("wait");
      expect(gamesAccess("loading", true, false, check)).toBe("wait");
      expect(gamesAccess("loading", false, false, check)).toBe("wait");
    }
  });

  it("lets a device that was signed in before play offline", () => {
    for (const check of checks) {
      expect(gamesAccess("unauthenticated", false, true, check)).toBe("allow");
      expect(gamesAccess("loading", false, true, check)).toBe("allow");
    }
  });

  it("waits for the server's answer before sending a remembered device to sign in", () => {
    expect(gamesAccess("unauthenticated", true, true, "pending")).toBe("wait");
  });

  it("sends a remembered device to sign in once the server confirmed there is no session", () => {
    expect(gamesAccess("unauthenticated", true, true, "none")).toBe("signin");
  });

  it("lets a remembered device play when the server cannot be reached although the browser says online", () => {
    expect(gamesAccess("unauthenticated", true, true, "unreachable")).toBe("allow");
  });

  it("lets a remembered device play when the server says the session is still there", () => {
    expect(gamesAccess("unauthenticated", true, true, "active")).toBe("allow");
  });
});

describe("needsSessionCheck", () => {
  it("asks the server only for a remembered device that looks signed out while online", () => {
    expect(needsSessionCheck("unauthenticated", true, true)).toBe(true);
    expect(needsSessionCheck("unauthenticated", true, false)).toBe(false);
    expect(needsSessionCheck("unauthenticated", false, true)).toBe(false);
    expect(needsSessionCheck("loading", true, true)).toBe(false);
    expect(needsSessionCheck("authenticated", true, true)).toBe(false);
  });
});

describe("checkSession", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("asks the session endpoint without the HTTP cache", async () => {
    fetchMock.mockResolvedValue(json(null));
    await checkSession();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", { cache: "no-store" });
  });

  it("reports no session when the server answers OK without a user", async () => {
    fetchMock.mockResolvedValue(json(null));
    expect(await checkSession()).toBe("none");
    fetchMock.mockResolvedValue(json({}));
    expect(await checkSession()).toBe("none");
  });

  it("reports an active session when the server answers with a user", async () => {
    fetchMock.mockResolvedValue(json({ user: { email: "a@b.c" }, expires: "2099-01-01" }));
    expect(await checkSession()).toBe("active");
  });

  it("reports unreachable on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await checkSession()).toBe("unreachable");
  });

  it("reports unreachable on a non-OK response", async () => {
    fetchMock.mockResolvedValue(json({ message: "boom" }, 500));
    expect(await checkSession()).toBe("unreachable");
  });

  it("reports unreachable when a captive portal answers OK with a page instead of JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Sign in to Wi-Fi</html>", { status: 200 }));
    expect(await checkSession()).toBe("unreachable");
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
