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

export const sha256Hex: Hash = (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);

export function randomSalt(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
}
