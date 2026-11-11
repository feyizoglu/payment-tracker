export interface AppLockState {
  pinHash: string | null;
  salt: string | null;
  economyLock: boolean;
  gameMode: boolean;
  failures: number;
  lockedUntil: number;
  /** When a requested PIN reset takes effect; 0 means none is pending. */
  resetAt: number;
}

export type Hash = (text: string) => Promise<string>;

export const APP_LOCK_KEY = "app_lock";
export const MAX_FREE_ATTEMPTS = 5;
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 15 * 60_000;
export const RESET_DELAY_MS = 60 * 60_000;

export const EMPTY_LOCK: AppLockState = {
  pinHash: null,
  salt: null,
  economyLock: false,
  gameMode: false,
  failures: 0,
  lockedUntil: 0,
  resetAt: 0,
};

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function hasPin(state: AppLockState): boolean {
  return state.pinHash !== null && state.salt !== null;
}

export async function setPin(state: AppLockState, pin: string, salt: string, hash: Hash): Promise<AppLockState> {
  if (!isValidPin(pin)) return state;
  return { ...state, pinHash: await hash(salt + pin), salt, failures: 0, lockedUntil: 0, resetAt: 0 };
}

export function clearPin(): AppLockState {
  return EMPTY_LOCK;
}

// A clock moved backwards must not turn a lockout into hours.
export function lockoutRemaining(state: AppLockState, now: number): number {
  return Math.min(MAX_LOCKOUT_MS, Math.max(0, state.lockedUntil - now));
}

export function clampLockout(state: AppLockState, now: number): AppLockState {
  return state.lockedUntil - now > MAX_LOCKOUT_MS ? { ...state, lockedUntil: now + MAX_LOCKOUT_MS } : state;
}

export function lockoutMessage(waitMs: number, t: { pinLockedOut: string; pinLockedOutMin: string }): string {
  const seconds = Math.ceil(waitMs / 1000);
  if (seconds >= 60) return t.pinLockedOutMin.replace("{m}", String(Math.ceil(seconds / 60)));
  return t.pinLockedOut.replace("{s}", String(seconds));
}

export async function checkPin(
  state: AppLockState,
  pin: string,
  now: number,
  hash: Hash
): Promise<{ ok: boolean; state: AppLockState }> {
  state = clampLockout(state, now);
  if (!hasPin(state) || lockoutRemaining(state, now) > 0) return { ok: false, state };
  if ((await hash(state.salt + pin)) === state.pinHash) {
    return { ok: true, state: { ...state, failures: 0, lockedUntil: 0, resetAt: 0 } };
  }
  const failures = state.failures + 1;
  const extra = failures - MAX_FREE_ATTEMPTS;
  const wait = extra < 0 ? 0 : Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** extra);
  return { ok: false, state: { ...state, failures, lockedUntil: wait > 0 ? now + wait : 0 } };
}

// Forgetting the PIN must not be a quick way past the lock for whoever holds the phone,
// so a reset only takes effect after a delay, and the lock stays on until then.
export function requestReset(state: AppLockState, now: number): AppLockState {
  if (!hasPin(state) || state.resetAt > 0) return state;
  return { ...state, resetAt: now + RESET_DELAY_MS };
}

export function cancelReset(state: AppLockState): AppLockState {
  return state.resetAt === 0 ? state : { ...state, resetAt: 0 };
}

export function resetRemaining(state: AppLockState, now: number): number {
  if (state.resetAt === 0) return 0;
  return Math.min(RESET_DELAY_MS, Math.max(0, state.resetAt - now));
}

export function applyReset(state: AppLockState, now: number): AppLockState {
  if (state.resetAt === 0) return state;
  if (now >= state.resetAt) return EMPTY_LOCK;
  return state.resetAt - now > RESET_DELAY_MS ? { ...state, resetAt: now + RESET_DELAY_MS } : state;
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
    resetAt: count(d.resetAt),
  };
}
