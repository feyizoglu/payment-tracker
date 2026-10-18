import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

import webpush from "web-push";
import { sendWebPush, type WebPushSubscription } from "./web-push";

const sub = (endpoint: string): WebPushSubscription => ({
  endpoint,
  p256dh: "p-key",
  auth: "a-key",
});
const payload = { title: "T", body: "B", url: "/dashboard?month=2026-10" };

const ENV_KEYS = ["VAPID_SUBJECT", "NEXT_PUBLIC_VAPID_PUBLIC", "VAPID_PRIVATE_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.VAPID_SUBJECT = "mailto:owner@example.com";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sendWebPush", () => {
  it("sends the JSON payload to every subscription", async () => {
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

    const result = await sendWebPush([sub("https://push.example/a"), sub("https://push.example/b")], payload);

    expect(result).toEqual({ sent: 2, expiredEndpoints: [], errors: [] });
    expect(webpush.setVapidDetails).toHaveBeenCalledWith("mailto:owner@example.com", "pub", "priv");
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.example/a", keys: { p256dh: "p-key", auth: "a-key" } },
      JSON.stringify(payload)
    );
  });

  it("marks 404 and 410 endpoints expired and records other failures as errors", async () => {
    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error("Not found"), { statusCode: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error("Server error"), { statusCode: 500 }))
      .mockResolvedValueOnce({} as never);

    const result = await sendWebPush(
      [
        sub("https://push.example/gone"),
        sub("https://push.example/missing"),
        sub("https://push.example/flaky"),
        sub("https://push.example/ok"),
      ],
      payload
    );

    expect(result.sent).toBe(1);
    expect(result.expiredEndpoints).toEqual([
      "https://push.example/gone",
      "https://push.example/missing",
    ]);
    expect(result.errors).toEqual(["Server error"]);
  });

  it("sends nothing and reports one error when VAPID env is missing", async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await sendWebPush([sub("https://push.example/a"), sub("https://push.example/b")], payload);

    expect(result).toEqual({ sent: 0, expiredEndpoints: [], errors: [expect.stringContaining("VAPID")] });
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("reports an error instead of throwing when the VAPID details are rejected", async () => {
    vi.mocked(webpush.setVapidDetails).mockImplementationOnce(() => {
      throw new Error("bad subject");
    });

    const result = await sendWebPush([sub("https://push.example/a")], payload);

    expect(result).toEqual({ sent: 0, expiredEndpoints: [], errors: ["bad subject"] });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("does nothing for an empty list", async () => {
    const result = await sendWebPush([], payload);
    expect(result).toEqual({ sent: 0, expiredEndpoints: [], errors: [] });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
