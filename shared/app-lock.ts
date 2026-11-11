export interface AppLockState {
  pinHash: string | null;
  salt: string | null;
  economyLock: boolean;
  gameMode: boolean;
  failures: number;
  lockedUntil: number;
}

export type Hash = (text: string) => Promise<string>;

export const APP_LOCK_KEY = "app_lock";
export const MAX_FREE_ATTEMPTS = 5;
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 15 * 60_000;

export const EMPTY_LOCK: AppLockState = {
  pinHash: null,
  salt: null,
  economyLock: false,
  gameMode: false,
  failures: 0,
  lockedUntil: 0,
};

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function hasPin(state: AppLockState): boolean {
  return state.pinHash !== null && state.salt !== null;
}

export async function setPin(state: AppLockState, pin: string, salt: string, hash: Hash): Promise<AppLockState> {
  if (!isValidPin(pin)) return state;
  return { ...state, pinHash: await hash(salt + pin), salt, failures: 0, lockedUntil: 0 };
}

export function clearPin(): AppLockState {
  return EMPTY_LOCK;
}

export function lockoutRemaining(state: AppLockState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

export async function checkPin(
  state: AppLockState,
  pin: string,
  now: number,
  hash: Hash
): Promise<{ ok: boolean; state: AppLockState }> {
  if (!hasPin(state) || lockoutRemaining(state, now) > 0) return { ok: false, state };
  if ((await hash(state.salt + pin)) === state.pinHash) {
    return { ok: true, state: { ...state, failures: 0, lockedUntil: 0 } };
  }
  const failures = state.failures + 1;
  const extra = failures - MAX_FREE_ATTEMPTS;
  const wait = extra < 0 ? 0 : Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** extra);
  return { ok: false, state: { ...state, failures, lockedUntil: wait > 0 ? now + wait : 0 } };
}

export function enterGameMode(state: AppLockState): AppLockState {
  return hasPin(state) ? { ...state, gameMode: true } : state;
}

export function exitGameMode(state: AppLockState): AppLockState {
  return { ...state, gameMode: false };
}

export function setEconomyLock(state: AppLockState, on: boolean): AppLockState {
  return { ...state, economyLock: on && hasPin(state) };
}

// Stored on the device, so an old or tampered value must not unlock anything by accident.
export function parseLockState(raw: string | null): AppLockState {
  if (!raw) return EMPTY_LOCK;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_LOCK;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return EMPTY_LOCK;
  const d = data as Record<string, unknown>;
  const pinHash = typeof d.pinHash === "string" && d.pinHash !== "" ? d.pinHash : null;
  const salt = typeof d.salt === "string" && d.salt !== "" ? d.salt : null;
  if (pinHash === null || salt === null) return EMPTY_LOCK;
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    pinHash,
    salt,
    economyLock: d.economyLock === true,
    gameMode: d.gameMode === true,
    failures: count(d.failures),
    lockedUntil: count(d.lockedUntil),
  };
}
