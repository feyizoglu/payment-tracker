export const DEVICES_PATH = "/api/devices";

// Expo/OS calls are injected so the decision flow stays unit-testable in node;
// push-native.ts supplies the real ones.
export interface PushDeps {
  isDevice: boolean;
  ensureChannel: () => Promise<void>;
  getPermission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermission: () => Promise<{ granted: boolean }>;
  getPushToken: () => Promise<string>;
  post: (path: string, body: unknown) => Promise<unknown>;
}

export type PushOutcome =
  | { kind: "registered"; token: string }
  | { kind: "denied" }
  | { kind: "unsupported" };

export async function registerForPush(deps: PushDeps): Promise<PushOutcome> {
  // Emulators cannot receive remote notifications and have no push token.
  if (!deps.isDevice) return { kind: "unsupported" };

  // Android 13+ only shows the permission prompt once a channel exists.
  await deps.ensureChannel();

  const current = await deps.getPermission();
  if (!current.granted) {
    if (!current.canAskAgain) return { kind: "denied" };
    const asked = await deps.requestPermission();
    if (!asked.granted) return { kind: "denied" };
  }

  const token = await deps.getPushToken();
  await deps.post(DEVICES_PATH, { expo_push_token: token, platform: "android" });
  return { kind: "registered", token };
}

export function unregisterBody(token: string) {
  return { expo_push_token: token };
}

// The cron puts the due month ("yyyy-MM") in the payload; anything else is ignored.
export function monthFromNotificationData(data: unknown): string | null {
  const month = (data as { month?: unknown } | null | undefined)?.month;
  return typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
}
