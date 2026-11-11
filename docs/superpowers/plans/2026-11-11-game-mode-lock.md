# Game Mode Lock and Economy PIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-device app PIN that locks everything except the games while game mode is on, and optionally guards every visit to Economy, on web and mobile.

**Architecture:** Pure lock rules in `shared/app-lock.ts` (state, PIN check with lockout, game mode and economy flags), with the hash function injected. Web keeps the state in `localStorage` behind a tiny external store and enforces it in one `AppLockGate` in the root layout, chosen by a pure `lockScreenFor(path, …)`. Mobile keeps it in `expo-secure-store` behind an `AppLockProvider` and enforces it with `Stack.Protected` guards plus an Economy gate.

**Tech Stack:** Next.js 16 client components, Web Crypto (`crypto.subtle`), Expo SDK 57 + Expo Router `Stack.Protected`, `expo-secure-store`, `expo-crypto` (both already installed — no native build), vitest (node env).

**Spec:** `docs/superpowers/specs/2026-11-11-game-mode-lock-design.md`

**Branch:** `feature/game-mode-lock` (on top of `feature/imposter-game`; the spec is committed).

**Ground rules for every task**
- `shared/` must contain no JSX and no platform APIs.
- New i18n keys go into BOTH `en` and `tr` in `shared/i18n.ts`.
- Mobile: `bg-surface`, never `bg-white`. Check https://docs.expo.dev/versions/v57.0.0/ for `Stack.Protected`, `expo-crypto`, `expo-secure-store` before writing mobile code (`mobile/AGENTS.md`).
- Web: read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` before writing web code (`AGENTS.md`).
- Root tests: `npx vitest run <file>`; mobile tests: `cd mobile && npx vitest run <file>`.
- Known pre-existing failures, not ours: 2 tests in `src/components/CalendarView.mark-paid.test.ts`; 54 repo-wide eslint problems. Lint only the files you touch.
- Conventional commits, no ticket keys, stage files by explicit path, no comments except for a constraint the code cannot show, every file ends with a newline.

---

## File map

| File | Responsibility |
|---|---|
| `shared/app-lock.ts` (new) | Lock state type, parse, PIN set/check/lockout, game mode, economy flag |
| `src/lib/app-lock.ts` (new) | `export *` shim |
| `src/lib/app-lock.test.ts` (new) | Rules tests |
| `shared/i18n.ts` (modify) | `pin*` / `gameModeExit` keys |
| `src/lib/app-lock-store.ts` (new) + test | Web storage, SHA-256, salt, `useAppLock` |
| `src/lib/app-lock-gate.ts` (new) + test | `lockScreenFor(path, state, economyUnlocked)` |
| `src/lib/web-push-client.ts` (modify) + test | Sign-out clears the lock |
| `src/components/lock/PinScreen.tsx`, `PinSetup.tsx`, `AppLockGate.tsx`, `PinSettings.tsx`, `PinMenuItem.tsx` (new) | Web lock UI |
| `src/app/layout.tsx` (modify) | Mount `AppLockGate` |
| `src/components/games/GamesShell.tsx` (modify) | Require a PIN, turn game mode on, exit link |
| `src/app/dashboard/page.tsx`, `src/app/economy/page.tsx`, `src/components/events/EventsHeader.tsx` (modify) | PIN item in the user menus |
| `mobile/src/lib/app-lock-storage.ts` (new) + test | SecureStore + expo-crypto |
| `mobile/src/lib/app-lock-context.tsx` (new) | `AppLockProvider`, `useAppLock` |
| `mobile/src/lib/auth-context.tsx` (modify) | Sign-out clears the lock |
| `mobile/src/components/lock/pin-screen.tsx`, `pin-setup.tsx`, `pin-settings.tsx`, `economy-gate.tsx` (new) | Mobile lock UI |
| `mobile/src/app/app-lock.tsx` (new) | Exit-game-mode screen |
| `mobile/src/app/_layout.tsx` (modify) | Provider + guards |
| `mobile/src/components/games/game-screen.tsx`, `mobile/src/app/games/index.tsx` (modify) | Exit button, PIN required, enter game mode |
| `mobile/src/app/(app)/settings.tsx`, `mobile/src/app/(app)/economy.tsx` (modify) | PIN section, Economy gate |

---

### Task 1: Lock rules

**Files:**
- Create: `shared/app-lock.ts`, `src/lib/app-lock.ts`
- Test: `src/lib/app-lock.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/app-lock.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BASE_LOCKOUT_MS,
  EMPTY_LOCK,
  MAX_FREE_ATTEMPTS,
  MAX_LOCKOUT_MS,
  checkPin,
  clearPin,
  enterGameMode,
  exitGameMode,
  hasPin,
  isValidPin,
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
    s = await failTimes({ ...s, lockedUntil: 0 }, 20, 0);
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
    expect(clearPin({ ...(await withPin()), economyLock: true, gameMode: true })).toEqual(EMPTY_LOCK);
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
    });
  });

  it("drops the flags when there is no PIN", () => {
    expect(parseLockState(JSON.stringify({ economyLock: true, gameMode: true }))).toEqual(EMPTY_LOCK);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/app-lock.test.ts`
Expected: FAIL — cannot resolve `@/lib/app-lock`.

- [ ] **Step 3: Implement**

`shared/app-lock.ts`:

```ts
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

export function clearPin(_state: AppLockState): AppLockState {
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
```

`src/lib/app-lock.ts`:

```ts
export * from "../../shared/app-lock";
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/app-lock.test.ts`
Expected: PASS. If eslint flags `_state` as unused in `clearPin`, change the signature to `clearPin(): AppLockState` and call sites/tests to `clearPin()`.

- [ ] **Step 5: Commit**

```bash
git add shared/app-lock.ts src/lib/app-lock.ts src/lib/app-lock.test.ts
git commit -m "feat(lock): add app PIN and game mode rules"
```

---

### Task 2: Translations

**Files:**
- Modify: `shared/i18n.ts` (after `imposterEnd` in `en` and in `tr`)

- [ ] **Step 1: English**, after `imposterEnd: "End game",`:

```ts
    // App lock
    pinTitle: "PIN",
    pinEnter: "Enter your PIN",
    pinGameModeTitle: "Game mode is on",
    pinGameModeDesc: "Enter the PIN to leave the games.",
    pinEconomyTitle: "Economy is locked",
    pinUnlock: "Unlock",
    pinWrong: "Wrong PIN",
    pinLockedOut: "Too many attempts. Try again in {s} s.",
    pinForgot: "Forgot PIN (sign out)",
    pinSetTitle: "Set a PIN for game mode",
    pinSetDesc: "While you play, the rest of the app stays locked behind this PIN.",
    pinNew: "New PIN (4–6 digits)",
    pinRepeat: "Repeat PIN",
    pinInvalid: "The PIN must be 4–6 digits",
    pinMismatch: "The PINs do not match",
    pinSave: "Save PIN",
    pinCurrent: "Current PIN",
    pinChange: "Change PIN",
    pinRemove: "Remove PIN",
    pinEconomyLock: "Ask for the PIN when opening Economy",
    pinNotSet: "No PIN set on this device",
    pinSaved: "PIN saved",
    gameModeExit: "Exit game mode",
```

- [ ] **Step 2: Turkish**, after `imposterEnd: "Oyunu bitir",`:

```ts
    // App lock
    pinTitle: "PIN",
    pinEnter: "PIN'ini gir",
    pinGameModeTitle: "Oyun modu açık",
    pinGameModeDesc: "Oyunlardan çıkmak için PIN'i gir.",
    pinEconomyTitle: "Ekonomi kilitli",
    pinUnlock: "Aç",
    pinWrong: "PIN yanlış",
    pinLockedOut: "Çok fazla deneme. {s} sn sonra tekrar dene.",
    pinForgot: "PIN'i unuttum (çıkış yap)",
    pinSetTitle: "Oyun modu için PIN belirle",
    pinSetDesc: "Oyun oynarken uygulamanın geri kalanı bu PIN ile kilitli kalır.",
    pinNew: "Yeni PIN (4–6 hane)",
    pinRepeat: "PIN'i tekrarla",
    pinInvalid: "PIN 4–6 haneli olmalı",
    pinMismatch: "PIN'ler aynı değil",
    pinSave: "PIN'i kaydet",
    pinCurrent: "Mevcut PIN",
    pinChange: "PIN'i değiştir",
    pinRemove: "PIN'i kaldır",
    pinEconomyLock: "Ekonomi'yi açarken PIN sor",
    pinNotSet: "Bu cihazda PIN belirlenmedi",
    pinSaved: "PIN kaydedildi",
    gameModeExit: "Oyun modundan çık",
```

- [ ] **Step 3: Verify**

Run: `npx vitest run src/lib/i18n.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add shared/i18n.ts
git commit -m "feat(lock): add app PIN translations"
```

---

### Task 3: Web lock store, gate rule, sign-out

**Files:**
- Create: `src/lib/app-lock-store.ts`, `src/lib/app-lock-store.test.ts`, `src/lib/app-lock-gate.ts`, `src/lib/app-lock-gate.test.ts`
- Modify: `src/lib/web-push-client.ts`, `src/lib/web-push-client.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/app-lock-gate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EMPTY_LOCK, type AppLockState } from "@/lib/app-lock";
import { lockScreenFor } from "@/lib/app-lock-gate";

const withPin: AppLockState = { ...EMPTY_LOCK, pinHash: "h", salt: "s" };

describe("lockScreenFor", () => {
  it("never locks without a PIN", () => {
    expect(lockScreenFor("/economy", EMPTY_LOCK, false)).toBe("none");
  });

  it("keeps sign-in and the games open in game mode, locks everything else", () => {
    const game = { ...withPin, gameMode: true };
    expect(lockScreenFor("/", game, false)).toBe("none");
    expect(lockScreenFor("/games", game, false)).toBe("none");
    expect(lockScreenFor("/games/imposter", game, false)).toBe("none");
    expect(lockScreenFor("/dashboard", game, false)).toBe("game");
    expect(lockScreenFor("/events/abc", game, false)).toBe("game");
    expect(lockScreenFor("/economy", game, true)).toBe("game");
    expect(lockScreenFor("/gamesx", game, false)).toBe("game");
  });

  it("locks Economy per visit when the economy lock is on", () => {
    const eco = { ...withPin, economyLock: true };
    expect(lockScreenFor("/economy", eco, false)).toBe("economy");
    expect(lockScreenFor("/economy", eco, true)).toBe("none");
    expect(lockScreenFor("/dashboard", eco, false)).toBe("none");
    expect(lockScreenFor("/economy", withPin, false)).toBe("none");
  });
});
```

`src/lib/app-lock-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { APP_LOCK_KEY, EMPTY_LOCK } from "@/lib/app-lock";
import { clearLock, randomSalt, readLockRaw, sha256Hex, subscribeLock, writeLock } from "@/lib/app-lock-store";

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
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app lock store", () => {
  it("hashes with SHA-256 as lowercase hex", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("makes a 16-byte hex salt that differs each time", () => {
    const a = randomSalt();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSalt()).not.toBe(a);
  });

  it("writes, reads, clears and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLock(listener);
    writeLock({ ...EMPTY_LOCK, pinHash: "h", salt: "s" });
    expect(JSON.parse(store[APP_LOCK_KEY]).pinHash).toBe("h");
    expect(readLockRaw()).toBe(store[APP_LOCK_KEY]);
    clearLock();
    expect(readLockRaw()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    writeLock(EMPTY_LOCK);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("survives a storage that throws", () => {
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
    expect(readLockRaw()).toBeNull();
    expect(() => writeLock(EMPTY_LOCK)).not.toThrow();
    expect(() => clearLock()).not.toThrow();
  });
});
```

Append to `src/lib/web-push-client.test.ts`, inside `describe("signOutWithPushCleanup", …)`, after the "forgets this device for offline games" test:

```ts
  it("deletes the app lock before signing out", async () => {
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem });
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), atob: globalThis.atob });
    stubBrowser(async () => undefined);

    await signOutWithPushCleanup();

    expect(removeItem).toHaveBeenCalledWith(APP_LOCK_KEY);
    expect(removeItem.mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(signOut).mock.invocationCallOrder[0]);
  });
```

and add `import { APP_LOCK_KEY } from "./app-lock";` next to the existing `import { GAMES_SIGNED_IN_KEY } from "./games-auth";`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/app-lock-gate.test.ts src/lib/app-lock-store.test.ts src/lib/web-push-client.test.ts`
Expected: FAIL — missing modules, and the new sign-out test fails.

- [ ] **Step 3: Implement**

`src/lib/app-lock-gate.ts`:

```ts
import { hasPin, type AppLockState } from "@/lib/app-lock";

export type LockScreen = "none" | "game" | "economy";

export function lockScreenFor(path: string, state: AppLockState, economyUnlocked: boolean): LockScreen {
  if (!hasPin(state) || path === "/") return "none";
  const inGames = path === "/games" || path.startsWith("/games/");
  if (state.gameMode) return inGames ? "none" : "game";
  const inEconomy = path === "/economy" || path.startsWith("/economy/");
  if (inEconomy && state.economyLock && !economyUnlocked) return "economy";
  return "none";
}
```

`src/lib/app-lock-store.ts`:

```ts
import { useMemo, useSyncExternalStore } from "react";
import { APP_LOCK_KEY, parseLockState, type AppLockState, type Hash } from "@/lib/app-lock";

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeLock(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === APP_LOCK_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function readLockRaw(): string | null {
  try {
    return localStorage.getItem(APP_LOCK_KEY);
  } catch {
    return null;
  }
}

export function writeLock(state: AppLockState): void {
  try {
    localStorage.setItem(APP_LOCK_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the lock only lasts for this page load.
  }
  notify();
}

export function clearLock(): void {
  try {
    localStorage.removeItem(APP_LOCK_KEY);
  } catch {
    // Nothing stored to clear.
  }
  notify();
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const sha256Hex: Hash = async (text) =>
  toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));

export function randomSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** `null` until the browser storage has been read (server render, first hydration pass). */
export function useAppLock(): AppLockState | null {
  const raw = useSyncExternalStore(subscribeLock, readLockRaw, () => undefined);
  return useMemo(() => (raw === undefined ? null : parseLockState(raw)), [raw]);
}
```

In `src/lib/web-push-client.ts` add `import { clearLock } from "./app-lock-store";` and call `clearLock();` right after `rememberSignedIn(false);` in `signOutWithPushCleanup`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/app-lock-gate.test.ts src/lib/app-lock-store.test.ts src/lib/web-push-client.test.ts && npx tsc --noEmit`
Expected: PASS. (Node 20 provides `crypto.subtle` and `crypto.getRandomValues` globally.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-lock-gate.ts src/lib/app-lock-gate.test.ts src/lib/app-lock-store.ts src/lib/app-lock-store.test.ts src/lib/web-push-client.ts src/lib/web-push-client.test.ts
git commit -m "feat(web): store the app lock and clear it on sign-out"
```

---

### Task 4: Web lock screens and gate

**Files:**
- Create: `src/components/lock/PinScreen.tsx`, `src/components/lock/PinSetup.tsx`, `src/components/lock/AppLockGate.tsx`
- Modify: `src/app/layout.tsx`, `src/components/games/GamesShell.tsx`

Verified by `tsc`, `eslint` on these files, `npm run build`, and the controller's browser check.

- [ ] **Step 1: `src/components/lock/PinSetup.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { isValidPin } from "@/lib/app-lock";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-center text-lg tracking-widest text-gray-900";

export default function PinSetup({ onDone, submitLabel }: { onDone: (pin: string) => void | Promise<void>; submitLabel?: string }) {
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin)) return setError(t.pinInvalid);
    if (pin !== repeat) return setError(t.pinMismatch);
    setBusy(true);
    await onDone(pin);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm text-gray-500">{t.pinNew}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className={inputClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-gray-500">{t.pinRepeat}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ""))}
          className={inputClass}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitLabel ?? t.pinSave}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `src/components/lock/PinScreen.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { checkPin, lockoutRemaining, type AppLockState } from "@/lib/app-lock";
import { sha256Hex, writeLock } from "@/lib/app-lock-store";
import { signOutWithPushCleanup } from "@/lib/web-push-client";

// Checks the PIN against the stored lock and saves the attempt count. `onUnlock` receives
// the updated state so the caller can apply its own change (exit game mode, …) on top.
export default function PinScreen({
  state,
  title,
  description,
  onUnlock,
  showForgot = true,
}: {
  state: AppLockState;
  title: string;
  description?: string;
  onUnlock: (state: AppLockState) => void;
  showForgot?: boolean;
}) {
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.ceil(lockoutRemaining(state, now) / 1000);

  useEffect(() => {
    if (state.lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.lockedUntil]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const at = Date.now();
    setNow(at);
    const result = await checkPin(state, pin, at, sha256Hex);
    setPin("");
    if (result.ok) {
      setError(null);
      onUnlock(result.state);
      return;
    }
    writeLock(result.state);
    setError(t.pinWrong);
  }

  return (
    <div className="mx-auto max-w-sm space-y-5 px-4 py-16 text-center">
      <Lock className="mx-auto w-8 h-8 text-gray-400" />
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          aria-label={t.pinEnter}
          placeholder={t.pinEnter}
          value={pin}
          disabled={wait > 0}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-center text-lg tracking-widest text-gray-900 disabled:opacity-50"
        />
        {wait > 0 ? (
          <p className="text-sm text-amber-700">{t.pinLockedOut.replace("{s}", String(wait))}</p>
        ) : (
          error && <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="submit"
          disabled={wait > 0 || pin.length < 4}
          className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t.pinUnlock}
        </button>
      </form>
      {showForgot && (
        <button type="button" onClick={() => void signOutWithPushCleanup()} className="text-sm text-gray-500 underline">
          {t.pinForgot}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `src/components/lock/AppLockGate.tsx`**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { exitGameMode } from "@/lib/app-lock";
import { lockScreenFor } from "@/lib/app-lock-gate";
import { useAppLock, writeLock } from "@/lib/app-lock-store";
import PinScreen from "./PinScreen";

function Gate({ path, children }: { path: string; children: ReactNode }) {
  const { t } = useLang();
  const lock = useAppLock();
  const [economyUnlocked, setEconomyUnlocked] = useState(false);

  if (!lock) return <>{children}</>;
  const screen = lockScreenFor(path, lock, economyUnlocked);
  if (screen === "none") return <>{children}</>;

  if (screen === "game") {
    return (
      <PinScreen
        state={lock}
        title={t.pinGameModeTitle}
        description={t.pinGameModeDesc}
        onUnlock={(next) => writeLock(exitGameMode(next))}
      />
    );
  }

  return (
    <PinScreen
      state={lock}
      title={t.pinEconomyTitle}
      onUnlock={(next) => {
        writeLock(next);
        setEconomyUnlocked(true);
      }}
    />
  );
}

// Keyed by path so an Economy unlock lasts only until the user leaves the page.
export default function AppLockGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <Gate key={path} path={path}>
      {children}
    </Gate>
  );
}
```

- [ ] **Step 4: Mount it in `src/app/layout.tsx`**

Add `import AppLockGate from "@/components/lock/AppLockGate";` and change
`<SessionProvider><LanguageProvider>{children}</LanguageProvider></SessionProvider>` to
`<SessionProvider><LanguageProvider><AppLockGate>{children}</AppLockGate></LanguageProvider></SessionProvider>`.

`src/app/layout.test.ts` may assert the layout tree; run it and, if it checks the exact children, update its expectation to include `AppLockGate` (do not weaken any other assertion).

- [ ] **Step 5: Games require a PIN and turn game mode on (`src/components/games/GamesShell.tsx`)**

Add imports:

```tsx
import { LogOut } from "lucide-react";
import PinSetup from "@/components/lock/PinSetup";
import { enterGameMode, hasPin, setPin } from "@/lib/app-lock";
import { randomSalt, sha256Hex, useAppLock, writeLock } from "@/lib/app-lock-store";
```

Inside the component, after `const access = …`:

```tsx
  const lock = useAppLock();
  const pinReady = lock !== null && hasPin(lock);

  useEffect(() => {
    if (access === "allow" && lock && hasPin(lock) && !lock.gameMode) writeLock(enterGameMode(lock));
  }, [access, lock]);
```

Replace the `<main>…</main>` branch so that, when allowed, it shows the PIN setup first if there is no PIN, and an exit link in the title row:

```tsx
        <main className="max-w-2xl mx-auto px-4 py-6">
          {lock === null ? null : !pinReady ? (
            <div className="mx-auto max-w-sm space-y-4 py-6">
              <div className="space-y-1 text-center">
                <h1 className="text-xl font-bold text-gray-900">{t.pinSetTitle}</h1>
                <p className="text-sm text-gray-500">{t.pinSetDesc}</p>
              </div>
              <PinSetup onDone={async (pin) => writeLock(enterGameMode(await setPin(lock, pin, randomSalt(), sha256Hex)))} />
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                {title && backHref && (
                  <a href={backHref} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" aria-label={t.back}>
                    <ArrowLeft className="w-5 h-5" />
                  </a>
                )}
                {title && <h1 className="flex-1 font-bold text-gray-900">{title}</h1>}
                <a
                  href="/dashboard"
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  <LogOut className="w-4 h-4" />
                  {t.gameModeExit}
                </a>
              </div>
              {children}
            </>
          )}
        </main>
```

(`/dashboard` is locked while game mode is on, so following the link shows the game-mode PIN screen; the right PIN turns game mode off and the dashboard appears.) Merge the imports with the existing `lucide-react` / React imports instead of duplicating them.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/lock src/components/games/GamesShell.tsx src/app/layout.tsx && npx vitest run src/app/layout.test.ts && npm run build`
Expected: clean; build lists the same routes as before.

- [ ] **Step 7: Commit**

```bash
git add src/components/lock/PinScreen.tsx src/components/lock/PinSetup.tsx src/components/lock/AppLockGate.tsx src/app/layout.tsx src/components/games/GamesShell.tsx
git commit -m "feat(web): lock the app behind a PIN while game mode is on"
```

(Add `src/app/layout.test.ts` to the `git add` only if Step 4 changed it.)

---

### Task 5: Web PIN settings in the user menus

**Files:**
- Create: `src/components/lock/PinSettings.tsx`, `src/components/lock/PinMenuItem.tsx`
- Modify: `src/app/dashboard/page.tsx` (~line 297), `src/app/economy/page.tsx` (~line 242), `src/components/events/EventsHeader.tsx` (~line 85) — right after each `<ThemePicker />`

- [ ] **Step 1: `src/components/lock/PinSettings.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { clearPin, hasPin, setEconomyLock, setPin, type AppLockState } from "@/lib/app-lock";
import { randomSalt, sha256Hex, useAppLock, writeLock } from "@/lib/app-lock-store";
import PinScreen from "./PinScreen";
import PinSetup from "./PinSetup";

// Set the PIN, or, after the current PIN, change it, remove it or toggle the Economy lock.
export default function PinSettings({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const lock = useAppLock();
  const [verified, setVerified] = useState(false);
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!lock) return null;

  async function save(current: AppLockState, pin: string) {
    writeLock(await setPin(current, pin, randomSalt(), sha256Hex));
    setChanging(false);
    setVerified(true);
    setNotice(t.pinSaved);
  }

  if (!hasPin(lock)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">{t.pinNotSet}</p>
        <PinSetup onDone={(pin) => save(lock, pin)} />
      </div>
    );
  }

  if (!verified) {
    return (
      <PinScreen
        state={lock}
        title={t.pinCurrent}
        showForgot={false}
        onUnlock={(next) => {
          writeLock(next);
          setVerified(true);
        }}
      />
    );
  }

  if (changing) return <PinSetup onDone={(pin) => save(lock, pin)} />;

  return (
    <div className="space-y-4">
      {notice && <p className="text-sm text-green-700">{notice}</p>}
      <label className="flex items-center justify-between gap-3">
        <span className="text-gray-900">{t.pinEconomyLock}</span>
        <input
          type="checkbox"
          checked={lock.economyLock}
          onChange={(e) => writeLock(setEconomyLock(lock, e.target.checked))}
          className="h-5 w-5 shrink-0"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          {t.pinChange}
        </button>
        <button
          type="button"
          onClick={() => {
            writeLock(clearPin(lock));
            onClose();
          }}
          className="flex-1 rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          {t.pinRemove}
        </button>
      </div>
    </div>
  );
}
```

(If Task 1 changed `clearPin` to take no argument, call `clearPin()` here.)

- [ ] **Step 2: `src/components/lock/PinMenuItem.tsx`**

```tsx
"use client";

import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import PinSettings from "./PinSettings";

export default function PinMenuItem() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
      >
        <KeyRound className="w-4 h-4" />
        {t.pinTitle}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{t.pinTitle}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.cancel} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <PinSettings onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
```

(Check `KeyRound` exists: `grep -c '"KeyRound"' node_modules/lucide-react/dist/lucide-react.d.ts`; else use `Lock`.)

- [ ] **Step 3: Add `<PinMenuItem />` right after `<ThemePicker />`** in `src/app/dashboard/page.tsx`, `src/app/economy/page.tsx` and `src/components/events/EventsHeader.tsx`, with `import PinMenuItem from "@/components/lock/PinMenuItem";` in each. If `src/components/events/EventsHeader.test.ts` counts menu children, keep its assertions true.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/lock && npx vitest run src/components/events/EventsHeader.test.ts && npm run build`
Expected: clean (the dashboard/economy files keep their pre-existing lint baseline — run `npx eslint src/app/dashboard/page.tsx src/app/economy/page.tsx` before and after and compare the counts; they must not grow).

- [ ] **Step 5: Commit**

```bash
git add src/components/lock/PinSettings.tsx src/components/lock/PinMenuItem.tsx src/app/dashboard/page.tsx src/app/economy/page.tsx src/components/events/EventsHeader.tsx
git commit -m "feat(web): set, change and remove the app PIN from the user menu"
```

---

### Task 6: Mobile lock storage and context

**Files:**
- Create: `mobile/src/lib/app-lock-storage.ts`, `mobile/src/lib/app-lock-storage.test.ts`, `mobile/src/lib/app-lock-context.tsx`
- Modify: `mobile/src/lib/auth-context.tsx`

- [ ] **Step 1: Write the failing test**

`mobile/src/lib/app-lock-storage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getItemAsync = vi.fn();
const setItemAsync = vi.fn();
const deleteItemAsync = vi.fn();
const digestStringAsync = vi.fn();
const getRandomBytes = vi.fn();

vi.mock("expo-secure-store", () => ({
  getItemAsync: (...a: unknown[]) => getItemAsync(...a),
  setItemAsync: (...a: unknown[]) => setItemAsync(...a),
  deleteItemAsync: (...a: unknown[]) => deleteItemAsync(...a),
}));

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (...a: unknown[]) => digestStringAsync(...a),
  getRandomBytes: (...a: unknown[]) => getRandomBytes(...a),
}));

import { APP_LOCK_KEY, EMPTY_LOCK } from "@ptracker/shared/app-lock";
import { clearStoredLock, getStoredLock, randomSalt, setStoredLock, sha256Hex } from "./app-lock-storage";

beforeEach(() => {
  for (const fn of [getItemAsync, setItemAsync, deleteItemAsync, digestStringAsync, getRandomBytes]) fn.mockReset();
});

describe("app lock storage", () => {
  it("reads and parses the stored lock", async () => {
    getItemAsync.mockResolvedValue(JSON.stringify({ pinHash: "h", salt: "s", gameMode: true }));
    const lock = await getStoredLock();
    expect(getItemAsync).toHaveBeenCalledWith(APP_LOCK_KEY);
    expect(lock.gameMode).toBe(true);
  });

  it("falls back to an empty lock when reading fails", async () => {
    getItemAsync.mockRejectedValue(new Error("keystore"));
    expect(await getStoredLock()).toEqual(EMPTY_LOCK);
  });

  it("writes JSON and clears", async () => {
    setItemAsync.mockResolvedValue(undefined);
    deleteItemAsync.mockResolvedValue(undefined);
    await setStoredLock(EMPTY_LOCK);
    expect(setItemAsync).toHaveBeenCalledWith(APP_LOCK_KEY, JSON.stringify(EMPTY_LOCK));
    await clearStoredLock();
    expect(deleteItemAsync).toHaveBeenCalledWith(APP_LOCK_KEY);
  });

  it("swallows write and delete errors", async () => {
    setItemAsync.mockRejectedValue(new Error("x"));
    deleteItemAsync.mockRejectedValue(new Error("x"));
    await expect(setStoredLock(EMPTY_LOCK)).resolves.toBeUndefined();
    await expect(clearStoredLock()).resolves.toBeUndefined();
  });

  it("hashes with SHA-256 and makes a hex salt", async () => {
    digestStringAsync.mockResolvedValue("abc123");
    expect(await sha256Hex("x")).toBe("abc123");
    expect(digestStringAsync).toHaveBeenCalledWith("SHA-256", "x");
    getRandomBytes.mockReturnValue(new Uint8Array([0, 15, 255]));
    expect(randomSalt()).toBe("000fff");
    expect(getRandomBytes).toHaveBeenCalledWith(16);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx vitest run src/lib/app-lock-storage.test.ts`
Expected: FAIL — cannot resolve `./app-lock-storage`.

- [ ] **Step 3: Implement**

`mobile/src/lib/app-lock-storage.ts`:

```ts
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { APP_LOCK_KEY, EMPTY_LOCK, parseLockState, type AppLockState, type Hash } from "@ptracker/shared/app-lock";

export async function getStoredLock(): Promise<AppLockState> {
  try {
    return parseLockState(await SecureStore.getItemAsync(APP_LOCK_KEY));
  } catch {
    return EMPTY_LOCK;
  }
}

export async function setStoredLock(state: AppLockState): Promise<void> {
  try {
    await SecureStore.setItemAsync(APP_LOCK_KEY, JSON.stringify(state));
  } catch {
    // Keystore unavailable: the lock only lasts until the app restarts.
  }
}

export async function clearStoredLock(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(APP_LOCK_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

export const sha256Hex: Hash = (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);

export function randomSalt(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
}
```

`mobile/src/lib/app-lock-context.tsx`:

```tsx
import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { getStoredLock, setStoredLock } from "@/lib/app-lock-storage";

interface AppLockContextValue {
  ready: boolean;
  lock: AppLockState;
  update: (next: AppLockState) => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue>({
  ready: false,
  lock: EMPTY_LOCK,
  update: async () => {},
});

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lock, setLock] = useState<AppLockState>(EMPTY_LOCK);

  useEffect(() => {
    let cancelled = false;
    getStoredLock().then((stored) => {
      if (cancelled) return;
      setLock(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (next: AppLockState) => {
    setLock(next);
    await setStoredLock(next);
  }, []);

  return <AppLockContext.Provider value={{ ready, lock, update }}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  return useContext(AppLockContext);
}
```

In `mobile/src/lib/auth-context.tsx`, import `clearStoredLock` from `@/lib/app-lock-storage` and, in `signOut`, add `await clearStoredLock();` directly after `await clearToken();` (before `setTok(null)`, so the provider that remounts on sign-out reads an empty lock). If `mobile/src/lib/auth-context.test.ts` mocks modules explicitly and now fails on the new import, add a `vi.mock("@/lib/app-lock-storage", () => ({ clearStoredLock: vi.fn().mockResolvedValue(undefined) }))` next to its other mocks and assert it is called in the existing sign-out test.

- [ ] **Step 4: Run to verify**

Run: `cd mobile && npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/app-lock-storage.ts mobile/src/lib/app-lock-storage.test.ts mobile/src/lib/app-lock-context.tsx mobile/src/lib/auth-context.tsx
git commit -m "feat(mobile): store the app lock and clear it on sign-out"
```

(Add `mobile/src/lib/auth-context.test.ts` if Step 3 changed it.)

---

### Task 7: Mobile lock screens, guards, settings, Economy gate

**Files:**
- Create: `mobile/src/components/lock/pin-screen.tsx`, `mobile/src/components/lock/pin-setup.tsx`, `mobile/src/components/lock/pin-settings.tsx`, `mobile/src/components/lock/economy-gate.tsx`, `mobile/src/app/app-lock.tsx`
- Modify: `mobile/src/app/_layout.tsx`, `mobile/src/components/games/game-screen.tsx`, `mobile/src/app/games/index.tsx`, `mobile/src/app/(app)/settings.tsx`, `mobile/src/app/(app)/economy.tsx`

- [ ] **Step 1: `mobile/src/components/lock/pin-setup.tsx`**

```tsx
import { isValidPin } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Field, inputBoxClass } from "@/components/ui/field";
import { PrimaryButton } from "@/components/ui/primary-button";

export function PinSetup({ onDone }: { onDone: (pin: string) => Promise<void> }) {
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!isValidPin(pin)) return setError(t.pinInvalid);
    if (pin !== repeat) return setError(t.pinMismatch);
    setBusy(true);
    await onDone(pin);
    setBusy(false);
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  return (
    <View className="gap-3">
      <Field label={t.pinNew}>
        <TextInput
          className={`${inputBoxClass} text-center tracking-widest`}
          value={pin}
          onChangeText={(v) => setPin(digits(v))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
      </Field>
      <Field label={t.pinRepeat}>
        <TextInput
          className={`${inputBoxClass} text-center tracking-widest`}
          value={repeat}
          onChangeText={(v) => setRepeat(digits(v))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
      </Field>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      <PrimaryButton label={t.pinSave} onPress={submit} busy={busy} />
    </View>
  );
}
```

- [ ] **Step 2: `mobile/src/components/lock/pin-screen.tsx`**

```tsx
import { checkPin, lockoutRemaining, type AppLockState } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { inputBoxClass } from "@/components/ui/field";
import { PrimaryButton } from "@/components/ui/primary-button";
import { useAppLock } from "@/lib/app-lock-context";
import { sha256Hex } from "@/lib/app-lock-storage";
import { useAuth } from "@/lib/auth-context";

// Checks the PIN and saves the attempt count; `onUnlock` gets the updated state so the
// caller applies its own change (exit game mode, …) on top.
export function PinScreen({
  title,
  description,
  onUnlock,
  showForgot = true,
}: {
  title: string;
  description?: string;
  onUnlock: (state: AppLockState) => void | Promise<void>;
  showForgot?: boolean;
}) {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  const { signOut } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.ceil(lockoutRemaining(lock, now) / 1000);

  useEffect(() => {
    if (lock.lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lock.lockedUntil]);

  async function submit() {
    const at = Date.now();
    setNow(at);
    const result = await checkPin(lock, pin, at, sha256Hex);
    setPin("");
    if (result.ok) {
      setError(null);
      await onUnlock(result.state);
      return;
    }
    await update(result.state);
    setError(t.pinWrong);
  }

  return (
    <View className="gap-5 px-2 py-10">
      <View className="items-center gap-1">
        <Text className="text-4xl">🔒</Text>
        <Text className="text-center text-xl font-bold text-gray-900">{title}</Text>
        {description ? <Text className="text-center text-sm text-gray-500">{description}</Text> : null}
      </View>
      <TextInput
        className={`${inputBoxClass} text-center text-lg tracking-widest`}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))}
        placeholder={t.pinEnter}
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        editable={wait === 0}
        autoFocus
      />
      {wait > 0 ? (
        <Text className="text-center text-sm text-amber-700">{t.pinLockedOut.replace("{s}", String(wait))}</Text>
      ) : error ? (
        <Text className="text-center text-sm text-red-600">{error}</Text>
      ) : null}
      <PrimaryButton label={t.pinUnlock} onPress={submit} disabled={wait > 0 || pin.length < 4} />
      {showForgot ? (
        <Pressable onPress={() => void signOut()} className="py-2">
          <Text className="text-center text-sm text-gray-500 underline">{t.pinForgot}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 3: `mobile/src/app/app-lock.tsx`** (exit game mode)

```tsx
import { exitGameMode } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { router } from "expo-router";

import { GameScreen } from "@/components/games/game-screen";
import { PinScreen } from "@/components/lock/pin-screen";
import { useAppLock } from "@/lib/app-lock-context";

export default function AppLockScreen() {
  const { t } = useLang();
  const { update } = useAppLock();
  return (
    <GameScreen title={t.gameModeExit}>
      <PinScreen
        title={t.pinGameModeTitle}
        description={t.pinGameModeDesc}
        onUnlock={async (next) => {
          await update(exitGameMode(next));
          router.replace("/");
        }}
      />
    </GameScreen>
  );
}
```

- [ ] **Step 4: Guards in `mobile/src/app/_layout.tsx`**

1. Import `AppLockProvider, useAppLock` from `@/lib/app-lock-context`.
2. In `RootNavigator`, read `const { ready: lockReady, lock } = useAppLock();`, include `lockReady` in the "not ready" spinner condition (`if (!ready || !lockReady)`), and replace the single `<Stack.Protected guard={isAuthenticated}>` block with:

```tsx
      <Stack.Protected guard={isAuthenticated && !lock.gameMode}>
        <Stack.Screen name="(app)" />
        {/* Write flows live at the root, as siblings of the tab group, so they can
            cover the tabs. Each screen draws its own header via <FormScreen>, which
            is why headerShown stays false. */}
        <Stack.Screen name="payment-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="occurrence-edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="payment/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recurring/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="asset-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="asset/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="manual-gold" options={{ presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" />
        <Stack.Screen name="event-expense" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="games/index" />
        <Stack.Screen name="games/imposter" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated && lock.gameMode}>
        <Stack.Screen name="app-lock" />
      </Stack.Protected>
```

(keep the existing `!isAuthenticated` → `sign-in` block). Check in the Expo Router v57 docs what happens to the current screen and history when a guard turns false (game mode turning on while `games/index` is open, and a cold start in game mode). The intended result: with game mode on, the app opens on `games/index` and no route outside games/app-lock is reachable.
3. Remount the lock provider per session so a sign-out reloads an empty lock. Add above `RootLayout`:

```tsx
function AppLockRoot({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return <AppLockProvider key={isAuthenticated ? 'in' : 'out'}>{children}</AppLockProvider>;
}
```

and wrap `<RootNavigator />` with `<AppLockRoot>…</AppLockRoot>` inside `RootLayout`.

- [ ] **Step 5: Exit button and back rules in `mobile/src/components/games/game-screen.tsx`**

Import `useAppLock` from `@/lib/app-lock-context` and `usePathname` from `expo-router`. In `GameScreen`:

```tsx
  const { lock } = useAppLock();
  const path = usePathname();
  // In game mode the games list is the root: going "back" from it would leave the games.
  const showBack = !(lock.gameMode && path === "/games");
```

Render the back `Pressable` only when `showBack` (keep a `<View className="w-14" />` placeholder otherwise), and replace the right-hand `<View className="w-14" />` with:

```tsx
        {lock.gameMode && path !== "/app-lock" ? (
          <Pressable onPress={() => router.push("/app-lock")} className="pl-3">
            <Text className="text-sm text-gray-500">{t.gameModeExit}</Text>
          </Pressable>
        ) : (
          <View className="w-14" />
        )}
```

Check with `console.log(usePathname())` once or in the docs that the games list path is `/games` (route file `games/index.tsx`).

- [ ] **Step 6: Require a PIN and enter game mode in `mobile/src/app/games/index.tsx`**

```tsx
import { enterGameMode, hasPin, setPin } from "@ptracker/shared/app-lock";
import { useEffect } from "react";
import { PinSetup } from "@/components/lock/pin-setup";
import { useAppLock } from "@/lib/app-lock-context";
import { randomSalt, sha256Hex } from "@/lib/app-lock-storage";
```

Inside `GamesScreen`:

```tsx
  const { lock, update } = useAppLock();

  useEffect(() => {
    if (hasPin(lock) && !lock.gameMode) void update(enterGameMode(lock));
  }, [lock, update]);

  if (!hasPin(lock)) {
    return (
      <GameScreen title={t.games}>
        <Text className="text-center text-xl font-bold text-gray-900">{t.pinSetTitle}</Text>
        <Text className="text-center text-sm text-gray-500">{t.pinSetDesc}</Text>
        <PinSetup onDone={async (pin) => update(enterGameMode(await setPin(lock, pin, randomSalt(), sha256Hex)))} />
      </GameScreen>
    );
  }
```

before the existing `return (<GameScreen …>` with the Imposter card.

- [ ] **Step 7: `mobile/src/components/lock/pin-settings.tsx`** and the Settings section

```tsx
import { clearPin, hasPin, setEconomyLock, setPin, type AppLockState } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { useAppLock } from "@/lib/app-lock-context";
import { randomSalt, sha256Hex } from "@/lib/app-lock-storage";
import { PinScreen } from "./pin-screen";
import { PinSetup } from "./pin-setup";

export function PinSettings() {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  const [verified, setVerified] = useState(false);
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(current: AppLockState, pin: string) {
    await update(await setPin(current, pin, randomSalt(), sha256Hex));
    setChanging(false);
    setVerified(true);
    setNotice(t.pinSaved);
  }

  if (!hasPin(lock)) {
    return (
      <View className="gap-3">
        <Text className="text-sm text-gray-500">{t.pinNotSet}</Text>
        <PinSetup onDone={(pin) => save(lock, pin)} />
      </View>
    );
  }

  if (!verified) {
    return (
      <PinScreen
        title={t.pinCurrent}
        showForgot={false}
        onUnlock={async (next) => {
          await update(next);
          setVerified(true);
        }}
      />
    );
  }

  if (changing) return <PinSetup onDone={(pin) => save(lock, pin)} />;

  return (
    <View className="gap-4">
      {notice ? <Text className="text-sm text-green-700">{notice}</Text> : null}
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-base text-gray-900">{t.pinEconomyLock}</Text>
        <Switch value={lock.economyLock} onValueChange={(on) => void update(setEconomyLock(lock, on))} />
      </View>
      <View className="flex-row gap-2">
        <Pressable onPress={() => setChanging(true)} className="flex-1 rounded-lg border border-gray-200 py-2.5">
          <Text className="text-center text-sm text-gray-700">{t.pinChange}</Text>
        </Pressable>
        <Pressable onPress={() => void update(clearPin(lock))} className="flex-1 rounded-lg border border-red-200 py-2.5">
          <Text className="text-center text-sm text-red-600">{t.pinRemove}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

(If Task 1 changed `clearPin` to take no argument, call `clearPin()`.)

In `mobile/src/app/(app)/settings.tsx`, import `PinSettings` from `@/components/lock/pin-settings` and add, right after the theme `</Section>`:

```tsx
        <Section title={t.pinTitle}>
          <PinSettings />
        </Section>
```

- [ ] **Step 8: Economy gate**

`mobile/src/components/lock/economy-gate.tsx`:

```tsx
import { hasPin } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { ScrollView } from "react-native";

import { TabScreen } from "@/components/tab-screen";
import { useAppLock } from "@/lib/app-lock-context";
import { PinScreen } from "./pin-screen";

// Asks for the PIN on every visit: leaving the tab locks it again.
export function EconomyGate({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  const [unlocked, setUnlocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => setUnlocked(false);
    }, [])
  );

  if (!lock.economyLock || !hasPin(lock) || unlocked) return <>{children}</>;

  return (
    <TabScreen>
      <ScrollView contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
        <PinScreen
          title={t.pinEconomyTitle}
          onUnlock={async (next) => {
            await update(next);
            setUnlocked(true);
          }}
        />
      </ScrollView>
    </TabScreen>
  );
}
```

In `mobile/src/app/(app)/economy.tsx`, rename `export default function Economy()` to `function EconomyContent()` and add at the end of the file:

```tsx
export default function Economy() {
  return (
    <EconomyGate>
      <EconomyContent />
    </EconomyGate>
  );
}
```

with `import { EconomyGate } from "@/components/lock/economy-gate";`.

- [ ] **Step 9: Verify**

Run: `cd mobile && npx tsc --noEmit && npx vitest run && npx expo export --platform android --output-dir /tmp/expo-export-check`
Expected: clean, all tests pass, "Exported: /tmp/expo-export-check". If `tsc` rejects `router.push("/app-lock")` because typed routes are stale, run `npx expo start --offline` for ~30 s to regenerate `.expo/types`, stop it, and re-run `tsc`.

- [ ] **Step 10: Commit**

```bash
git add mobile/src/components/lock/pin-screen.tsx mobile/src/components/lock/pin-setup.tsx mobile/src/components/lock/pin-settings.tsx mobile/src/components/lock/economy-gate.tsx mobile/src/app/app-lock.tsx mobile/src/app/_layout.tsx mobile/src/components/games/game-screen.tsx mobile/src/app/games/index.tsx "mobile/src/app/(app)/settings.tsx" "mobile/src/app/(app)/economy.tsx"
git commit -m "feat(mobile): lock the app behind a PIN in game mode and guard Economy"
```

---

### Task 8: Verification

- [ ] **Step 1:** Root: `npx vitest run && npx tsc --noEmit && npm run build` — only the 2 known `CalendarView` failures.
- [ ] **Step 2:** Mobile: `cd mobile && npx tsc --noEmit && npx vitest run && npx expo export --platform android --output-dir /tmp/expo-export-check`.
- [ ] **Step 3 (controller, browser):** production build on `localhost:3000` with `AUTH_TRUST_HOST=true`; as a signed-in user: open `/games` → PIN setup → games open; type `/economy` and `/dashboard` → game-mode PIN screen; 5 wrong PINs → 30 s wait; right PIN after the wait → dashboard; user menu → PIN → turn on the Economy lock → `/economy` asks the PIN, leaving and coming back asks again.
- [ ] **Step 4 (owner, Android):** same flow on the device, plus the hardware back button from the games list in game mode, and an app restart in game mode opening on the games.
