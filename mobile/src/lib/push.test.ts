import { describe, it, expect, vi } from "vitest";
import {
  DEVICES_PATH,
  monthFromNotificationData,
  registerForPush,
  unregisterBody,
  unregisterFromPush,
  type PushDeps,
} from "./push";

function deps(over: Partial<PushDeps> = {}): PushDeps {
  return {
    isDevice: true,
    ensureChannel: vi.fn().mockResolvedValue(undefined),
    getPermission: vi.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
    requestPermission: vi.fn().mockResolvedValue({ granted: true }),
    getPushToken: vi.fn().mockResolvedValue("ExponentPushToken[abc]"),
    post: vi.fn().mockResolvedValue({ ok: true }),
    ...over,
  };
}

describe("registerForPush", () => {
  it("registers the token when permission is already granted", async () => {
    const d = deps();
    await expect(registerForPush(d)).resolves.toEqual({ kind: "registered", token: "ExponentPushToken[abc]" });
    expect(d.requestPermission).not.toHaveBeenCalled();
    expect(d.post).toHaveBeenCalledWith(DEVICES_PATH, {
      expo_push_token: "ExponentPushToken[abc]",
      platform: "android",
    });
  });

  it("creates the channel before reading the permission", async () => {
    const order: string[] = [];
    const d = deps({
      ensureChannel: vi.fn(async () => void order.push("channel")),
      getPermission: vi.fn(async () => (order.push("permission"), { granted: true, canAskAgain: true })),
    });
    await registerForPush(d);
    expect(order).toEqual(["channel", "permission"]);
  });

  it("asks when not yet granted and registers on yes", async () => {
    const d = deps({ getPermission: vi.fn().mockResolvedValue({ granted: false, canAskAgain: true }) });
    await expect(registerForPush(d)).resolves.toMatchObject({ kind: "registered" });
    expect(d.requestPermission).toHaveBeenCalledOnce();
  });

  it("stops without a token when the user says no", async () => {
    const d = deps({
      getPermission: vi.fn().mockResolvedValue({ granted: false, canAskAgain: true }),
      requestPermission: vi.fn().mockResolvedValue({ granted: false }),
    });
    await expect(registerForPush(d)).resolves.toEqual({ kind: "denied" });
    expect(d.getPushToken).not.toHaveBeenCalled();
    expect(d.post).not.toHaveBeenCalled();
  });

  it("does not prompt again once the OS will not ask", async () => {
    const d = deps({ getPermission: vi.fn().mockResolvedValue({ granted: false, canAskAgain: false }) });
    await expect(registerForPush(d)).resolves.toEqual({ kind: "denied" });
    expect(d.requestPermission).not.toHaveBeenCalled();
  });

  it("skips emulators entirely", async () => {
    const d = deps({ isDevice: false });
    await expect(registerForPush(d)).resolves.toEqual({ kind: "unsupported" });
    expect(d.ensureChannel).not.toHaveBeenCalled();
  });

  it("propagates a failed registration call", async () => {
    const d = deps({ post: vi.fn().mockRejectedValue(new Error("HTTP 500")) });
    await expect(registerForPush(d)).rejects.toThrow("HTTP 500");
  });
});

describe("monthFromNotificationData", () => {
  it("reads the cron's yyyy-MM month", () => {
    expect(monthFromNotificationData({ month: "2026-10" })).toBe("2026-10");
  });
  it("ignores missing or malformed months", () => {
    expect(monthFromNotificationData(undefined)).toBeNull();
    expect(monthFromNotificationData({ month: "2026-13" })).toBeNull();
    expect(monthFromNotificationData({ month: 202610 })).toBeNull();
  });
});

describe("unregisterBody", () => {
  it("matches the DELETE /api/devices body", () => {
    expect(unregisterBody("ExponentPushToken[abc]")).toEqual({ expo_push_token: "ExponentPushToken[abc]" });
  });
});

describe("unregisterFromPush", () => {
  const getPushToken = () => vi.fn().mockResolvedValue("ExponentPushToken[fresh]");

  it("deletes the token this session registered without asking Expo", async () => {
    const del = vi.fn().mockResolvedValue({ ok: true });
    const fetchToken = getPushToken();
    await unregisterFromPush({ knownToken: "ExponentPushToken[abc]", isDevice: true, getPushToken: fetchToken, del });
    expect(fetchToken).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith(DEVICES_PATH, { expo_push_token: "ExponentPushToken[abc]" });
  });

  it("asks Expo for the token when this session never registered", async () => {
    const del = vi.fn().mockResolvedValue({ ok: true });
    await unregisterFromPush({ knownToken: null, isDevice: true, getPushToken: getPushToken(), del });
    expect(del).toHaveBeenCalledWith(DEVICES_PATH, { expo_push_token: "ExponentPushToken[fresh]" });
  });

  it("does nothing on an emulator with no known token", async () => {
    const del = vi.fn();
    const fetchToken = getPushToken();
    await unregisterFromPush({ knownToken: null, isDevice: false, getPushToken: fetchToken, del });
    expect(fetchToken).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("propagates a failed DELETE so the caller can log it", async () => {
    const del = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      unregisterFromPush({ knownToken: "ExponentPushToken[abc]", isDevice: true, getPushToken: getPushToken(), del })
    ).rejects.toThrow("offline");
  });
});
