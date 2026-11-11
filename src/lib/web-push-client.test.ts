import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { signOut } from "next-auth/react";
import { APP_LOCK_KEY } from "./app-lock";
import { GAMES_SIGNED_IN_KEY } from "./games-auth";
import {
  deleteWebPushSubscription,
  signOutWithPushCleanup,
  urlBase64ToUint8Array,
} from "./web-push-client";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

function stubBrowser(getRegistration: () => Promise<unknown>) {
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
}

function subscription() {
  return { endpoint: ENDPOINT, unsubscribe: vi.fn().mockResolvedValue(true) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { atob: globalThis.atob });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("urlBase64ToUint8Array", () => {
  it("decodes an unpadded URL-safe key containing - and _", () => {
    expect(Array.from(urlBase64ToUint8Array("-_8A_-8"))).toEqual([251, 255, 0, 255, 239]);
  });
});

describe("deleteWebPushSubscription", () => {
  it("DELETEs the endpoint at /api/web-push", async () => {
    await deleteWebPushSubscription(ENDPOINT);

    expect(fetch).toHaveBeenCalledWith("/api/web-push", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: ENDPOINT }),
    });
  });
});

describe("signOutWithPushCleanup", () => {
  let replace: ReturnType<typeof vi.fn>;
  let removeItem: ReturnType<typeof vi.fn>;
  let setItem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replace = vi.fn();
    removeItem = vi.fn();
    setItem = vi.fn();
    vi.stubGlobal("window", {
      atob: globalThis.atob,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: { replace },
    });
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem, removeItem });
    vi.mocked(signOut).mockResolvedValue({ url: "http://localhost:3000/" } as never);
  });

  it("deletes the endpoint, unsubscribes, then signs out without a redirect", async () => {
    const sub = subscription();
    stubBrowser(async () => ({ pushManager: { getSubscription: async () => sub } }));

    await signOutWithPushCleanup();

    expect(fetch).toHaveBeenCalledWith(
      "/api/web-push",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ endpoint: ENDPOINT }) })
    );
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    const deleted = vi.mocked(fetch).mock.invocationCallOrder[0];
    const unsubscribed = sub.unsubscribe.mock.invocationCallOrder[0];
    const signedOut = vi.mocked(signOut).mock.invocationCallOrder[0];
    expect(deleted).toBeLessThan(unsubscribed);
    expect(unsubscribed).toBeLessThan(signedOut);
  });

  it("still signs out when getRegistration rejects", async () => {
    stubBrowser(() => Promise.reject(new Error("no registration")));

    await expect(signOutWithPushCleanup()).resolves.toBeUndefined();

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still unsubscribes and signs out when the DELETE request rejects", async () => {
    const sub = subscription();
    vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
    stubBrowser(async () => ({ pushManager: { getSubscription: async () => sub } }));

    await expect(signOutWithPushCleanup()).resolves.toBeUndefined();

    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it("forgets this device for offline games and the app lock only after signing out, then goes home", async () => {
    stubBrowser(async () => undefined);

    await signOutWithPushCleanup();

    expect(removeItem).toHaveBeenCalledWith(GAMES_SIGNED_IN_KEY);
    expect(removeItem).toHaveBeenCalledWith(APP_LOCK_KEY);
    const signedOut = vi.mocked(signOut).mock.invocationCallOrder[0];
    expect(removeItem.mock.invocationCallOrder[0]).toBeGreaterThan(signedOut);
    expect(replace).toHaveBeenCalledWith("/");
    expect(replace.mock.invocationCallOrder[0]).toBeGreaterThan(removeItem.mock.invocationCallOrder.at(-1)!);
  });

  it("keeps the app lock and the games flag when signOut rejects", async () => {
    stubBrowser(async () => undefined);
    vi.mocked(signOut).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(signOutWithPushCleanup()).rejects.toThrow("Failed to fetch");

    expect(removeItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the app lock when the server answers with an error page instead of signing out", async () => {
    stubBrowser(async () => undefined);
    vi.mocked(signOut).mockResolvedValue({ url: "http://localhost:3000/api/auth/error?error=MissingCSRF" } as never);

    await expect(signOutWithPushCleanup()).rejects.toThrow();

    expect(removeItem).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
