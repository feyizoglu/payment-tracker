import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  AndroidImportance: { HIGH: 4 },
}));
vi.mock("expo-device", () => ({ isDevice: true }));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } },
}));

import * as Notifications from "expo-notifications";
import { nativePushDeps } from "./push-native";

beforeEach(() => vi.clearAllMocks());

describe("nativePushDeps", () => {
  it("requests the token for the EAS project and returns its data", async () => {
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      type: "expo",
      data: "ExponentPushToken[abc]",
    } as never);
    await expect(nativePushDeps(vi.fn()).getPushToken()).resolves.toBe("ExponentPushToken[abc]");
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
  });

  it("projects the permission to granted and canAskAgain", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: "undetermined",
      expires: "never",
    } as never);
    await expect(nativePushDeps(vi.fn()).getPermission()).resolves.toEqual({ granted: false, canAskAgain: true });
  });

  it("creates the default channel with high importance", async () => {
    await nativePushDeps(vi.fn()).ensureChannel();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH })
    );
  });

  it("passes post through unchanged", () => {
    const post = vi.fn();
    expect(nativePushDeps(post).post).toBe(post);
  });
});
