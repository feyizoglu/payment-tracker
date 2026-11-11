import { describe, it, expect } from "vitest";
import {
  BASE_LOCKOUT_MS,
  EMPTY_LOCK,
  MAX_FREE_ATTEMPTS,
  MAX_LOCKOUT_MS,
  RESET_DELAY_MS,
  applyReset,
  cancelReset,
  requestReset,
  resetRemaining,
  checkPin,
  clampLockout,
  clearPin,
  enterGameMode,
  exitGameMode,
  hasPin,
  isValidPin,
  lockoutMessage,
  lockoutRemaining,
  parseLockState,
  setEconomyLock,
  setPin,
  type AppLockState,
} from "@/lib/app-lock";

// Deterministic stand-in for SHA-256: enough to tell inputs apart.
const fakeHash = async (text: string) => `h(${text})`;
const SALT = "00ff";

async function withPin(pin = "1234"): Promise<AppLockState> {
  return setPin(EMPTY_LOCK, pin, SALT, fakeHash);
}

async function failTimes(state: AppLockState, times: number, now: number): Promise<AppLockState> {
  let s = state;
  for (let i = 0; i < times; i++) s = (await checkPin(s, "0000", now, fakeHash)).state;
  return s;
}

describe("isValidPin", () => {
  it("accepts 4 to 6 digits only", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin(" 1234")).toBe(false);
  });
});

describe("setPin", () => {
  it("stores the salted hash, never the PIN, and resets failures", async () => {
    const s = await setPin({ ...EMPTY_LOCK, failures: 7, lockedUntil: 99 }, "1234", SALT, fakeHash);
    expect(s.pinHash).toBe("h(00ff1234)");
    expect(s.salt).toBe(SALT);
    expect(JSON.stringify(s)).not.toContain('"1234"');
    expect(s.failures).toBe(0);
    expect(s.lockedUntil).toBe(0);
    expect(hasPin(s)).toBe(true);
  });

  it("keeps the economy and game mode flags when the PIN changes", async () => {
    const before = { ...(await withPin()), economyLock: true, gameMode: true };
    const after = await setPin(before, "5678", "aa", fakeHash);
    expect(after.economyLock).toBe(true);
    expect(after.gameMode).toBe(true);
  });

  it("ignores an invalid PIN", async () => {
    expect(await setPin(EMPTY_LOCK, "12", SALT, fakeHash)).toBe(EMPTY_LOCK);
  });
});

describe("checkPin", () => {
  it("accepts the right PIN", async () => {
    const { ok, state } = await checkPin(await withPin(), "1234", 0, fakeHash);
    expect(ok).toBe(true);
    expect(state.failures).toBe(0);
  });

  it("counts wrong PINs without a wait for the first attempts", async () => {
    const s = await failTimes(await withPin(), MAX_FREE_ATTEMPTS - 1, 0);
    expect(s.failures).toBe(MAX_FREE_ATTEMPTS - 1);
    expect(lockoutRemaining(s, 0)).toBe(0);
  });

  it("locks for 30 s at the 5th wrong PIN, then doubles, capped at 15 min", async () => {
    let s = await failTimes(await withPin(), MAX_FREE_ATTEMPTS, 1000);
    expect(lockoutRemaining(s, 1000)).toBe(BASE_LOCKOUT_MS);
    s = await failTimes(s, 1, 1000 + BASE_LOCKOUT_MS);
    expect(lockoutRemaining(s, 1000 + BASE_LOCKOUT_MS)).toBe(BASE_LOCKOUT_MS * 2);
    for (let i = 0; i < 20; i++) s = await failTimes({ ...s, lockedUntil: 0 }, 1, 0);
    expect(lockoutRemaining(s, 0)).toBe(MAX_LOCKOUT_MS);
  });

  it("refuses even the right PIN while locked out", async () => {
    const locked = await failTimes(await withPin(), MAX_FREE_ATTEMPTS, 0);
    const { ok, state } = await checkPin(locked, "1234", 10, fakeHash);
    expect(ok).toBe(false);
    expect(state).toBe(locked);
  });

  it("resets the counter after the right PIN", async () => {
    const locked = await failTimes(await withPin(), MAX_FREE_ATTEMPTS, 0);
    const { ok, state } = await checkPin(locked, "1234", BASE_LOCKOUT_MS, fakeHash);
    expect(ok).toBe(true);
    expect(state.failures).toBe(0);
    expect(state.lockedUntil).toBe(0);
  });

  it("treats a lockout further away than the maximum as the maximum (clock moved back)", async () => {
    const now = 1_000_000;
    const skewed = { ...(await withPin()), failures: MAX_FREE_ATTEMPTS, lockedUntil: now + 10 * 60 * 60_000 };
    expect(lockoutRemaining(skewed, now)).toBe(MAX_LOCKOUT_MS);
    const refused = await checkPin(skewed, "1234", now, fakeHash);
    expect(refused.ok).toBe(false);
    expect(refused.state.lockedUntil).toBe(now + MAX_LOCKOUT_MS);
    const later = await checkPin(refused.state, "1234", now + MAX_LOCKOUT_MS, fakeHash);
    expect(later.ok).toBe(true);
  });

  it("fails without a PIN set", async () => {
    expect((await checkPin(EMPTY_LOCK, "1234", 0, fakeHash)).ok).toBe(false);
  });
});

describe("game mode and economy flags", () => {
  it("only enters game mode when a PIN exists", async () => {
    expect(enterGameMode(EMPTY_LOCK)).toBe(EMPTY_LOCK);
    expect(enterGameMode(await withPin()).gameMode).toBe(true);
    expect(exitGameMode({ ...(await withPin()), gameMode: true }).gameMode).toBe(false);
  });

  it("only turns the economy lock on when a PIN exists", async () => {
    expect(setEconomyLock(EMPTY_LOCK, true).economyLock).toBe(false);
    expect(setEconomyLock(await withPin(), true).economyLock).toBe(true);
    expect(setEconomyLock({ ...(await withPin()), economyLock: true }, false).economyLock).toBe(false);
  });

  it("clears everything when the PIN is removed", async () => {
    expect(clearPin()).toEqual(EMPTY_LOCK);
  });
});

describe("parseLockState", () => {
  it("falls back to an empty lock for missing or broken data", () => {
    expect(parseLockState(null)).toEqual(EMPTY_LOCK);
    expect(parseLockState("{oops")).toEqual(EMPTY_LOCK);
    expect(parseLockState("[]")).toEqual(EMPTY_LOCK);
  });

  it("keeps valid fields and drops invalid ones", () => {
    const raw = JSON.stringify({
      pinHash: "abc",
      salt: "00ff",
      economyLock: true,
      gameMode: true,
      failures: -3,
      lockedUntil: "soon",
    });
    expect(parseLockState(raw)).toEqual({
      pinHash: "abc",
      salt: "00ff",
      economyLock: true,
      gameMode: true,
      failures: 0,
      lockedUntil: 0,
      resetAt: 0,
    });
  });

  it("drops the flags when there is no PIN", () => {
    expect(parseLockState(JSON.stringify({ economyLock: true, gameMode: true }))).toEqual(EMPTY_LOCK);
  });
});

describe("clampLockout", () => {
  it("pulls a lockout beyond the maximum back to now + maximum", async () => {
    const s = { ...(await withPin()), lockedUntil: 10 * MAX_LOCKOUT_MS };
    expect(clampLockout(s, 0).lockedUntil).toBe(MAX_LOCKOUT_MS);
  });

  it("returns the same state when the lockout is within the maximum", async () => {
    const s = { ...(await withPin()), lockedUntil: MAX_LOCKOUT_MS };
    expect(clampLockout(s, 0)).toBe(s);
    const none = await withPin();
    expect(clampLockout(none, 5)).toBe(none);
  });
});

describe("lockoutMessage", () => {
  const t = { pinLockedOut: "wait {s} s", pinLockedOutMin: "wait {m} min" };

  it("shows seconds under a minute, rounded up", () => {
    expect(lockoutMessage(29_001, t)).toBe("wait 30 s");
    expect(lockoutMessage(59_000, t)).toBe("wait 59 s");
  });

  it("shows minutes, rounded up, from 60 s", () => {
    expect(lockoutMessage(60_000, t)).toBe("wait 1 min");
    expect(lockoutMessage(60_001, t)).toBe("wait 2 min");
    expect(lockoutMessage(MAX_LOCKOUT_MS, t)).toBe("wait 15 min");
  });
});

describe("delayed PIN reset", () => {
  it("schedules the reset one hour ahead and keeps the lock meanwhile", async () => {
    const locked = { ...(await withPin()), gameMode: true };
    const pending = requestReset(locked, 1000);
    expect(pending.resetAt).toBe(1000 + RESET_DELAY_MS);
    expect(hasPin(pending)).toBe(true);
    expect(pending.gameMode).toBe(true);
    expect(applyReset(pending, 1000 + RESET_DELAY_MS - 1)).toBe(pending);
    expect(resetRemaining(pending, 1000)).toBe(RESET_DELAY_MS);
  });

  it("removes the whole lock once the hour has passed", async () => {
    const pending = requestReset({ ...(await withPin()), gameMode: true, economyLock: true }, 0);
    expect(applyReset(pending, RESET_DELAY_MS)).toEqual(EMPTY_LOCK);
  });

  it("does not restart or shorten a pending reset, and needs a PIN to exist", async () => {
    const pending = requestReset(await withPin(), 0);
    expect(requestReset(pending, 5000)).toBe(pending);
    expect(requestReset(EMPTY_LOCK, 0)).toBe(EMPTY_LOCK);
  });

  it("can be cancelled, and the right PIN cancels it too", async () => {
    const pending = requestReset(await withPin(), 0);
    expect(cancelReset(pending).resetAt).toBe(0);
    const { ok, state } = await checkPin(pending, "1234", 10, fakeHash);
    expect(ok).toBe(true);
    expect(state.resetAt).toBe(0);
  });

  it("survives wrong PINs and a new PIN clears it", async () => {
    const pending = requestReset(await withPin(), 0);
    expect((await checkPin(pending, "0000", 10, fakeHash)).state.resetAt).toBe(RESET_DELAY_MS);
    expect((await setPin(pending, "5678", "aa", fakeHash)).resetAt).toBe(0);
  });

  it("never waits longer than an hour after the clock moved back", async () => {
    const pending = requestReset(await withPin(), 10 * RESET_DELAY_MS);
    expect(resetRemaining(pending, 0)).toBe(RESET_DELAY_MS);
    expect(applyReset(pending, 0).resetAt).toBe(RESET_DELAY_MS);
  });

  it("is kept by parseLockState and dropped when invalid", async () => {
    const pending = requestReset(await withPin(), 0);
    expect(parseLockState(JSON.stringify(pending)).resetAt).toBe(RESET_DELAY_MS);
    expect(parseLockState(JSON.stringify({ ...pending, resetAt: "soon" })).resetAt).toBe(0);
  });
});
