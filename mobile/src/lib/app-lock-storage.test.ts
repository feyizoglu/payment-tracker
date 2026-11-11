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
