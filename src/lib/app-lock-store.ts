import { useMemo, useSyncExternalStore } from "react";
import { APP_LOCK_KEY, parseLockState, type AppLockState, type Hash } from "@/lib/app-lock";

const listeners = new Set<() => void>();
// Set when storage refused a write, so the lock still holds for this page's lifetime.
let memory: string | null | undefined;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeLock(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === APP_LOCK_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", listener);
  };
}

export function readLockRaw(): string | null {
  if (memory !== undefined) return memory;
  try {
    return localStorage.getItem(APP_LOCK_KEY);
  } catch {
    return null;
  }
}

export function writeLock(state: AppLockState): void {
  const raw = JSON.stringify(state);
  try {
    localStorage.setItem(APP_LOCK_KEY, raw);
    memory = undefined;
  } catch {
    memory = raw;
  }
  notify();
}

export function clearLock(): void {
  try {
    localStorage.removeItem(APP_LOCK_KEY);
    memory = undefined;
  } catch {
    memory = null;
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
