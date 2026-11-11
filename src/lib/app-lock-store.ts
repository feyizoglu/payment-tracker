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
