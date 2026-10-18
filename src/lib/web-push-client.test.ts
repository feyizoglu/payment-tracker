import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { signOut } from "next-auth/react";
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
  it("deletes the endpoint, unsubscribes, then signs out", async () => {
    const sub = subscription();
    stubBrowser(async () => ({ pushManager: { getSubscription: async () => sub } }));

    await signOutWithPushCleanup();

    expect(fetch).toHaveBeenCalledWith(
      "/api/web-push",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ endpoint: ENDPOINT }) })
    );
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    const deleted = vi.mocked(fetch).mock.invocationCallOrder[0];
    const unsubscribed = sub.unsubscribe.mock.invocationCallOrder[0];
    const signedOut = vi.mocked(signOut).mock.invocationCallOrder[0];
    expect(deleted).toBeLessThan(unsubscribed);
    expect(unsubscribed).toBeLessThan(signedOut);
  });

  it("still signs out when getRegistration rejects", async () => {
    stubBrowser(() => Promise.reject(new Error("no registration")));

    await expect(signOutWithPushCleanup()).resolves.toBeUndefined();

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still unsubscribes and signs out when the DELETE request rejects", async () => {
    const sub = subscription();
    vi.mocked(fetch).mockRejectedValue(new TypeError("network down"));
    stubBrowser(async () => ({ pushManager: { getSubscription: async () => sub } }));

    await expect(signOutWithPushCleanup()).resolves.toBeUndefined();

    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/" });
  });
});
