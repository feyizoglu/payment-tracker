import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { DEFAULT_SETUP, SETUP_STORAGE_KEY } from "@ptracker/shared/imposter";
import { getStoredSetup, setStoredSetup } from "./imposter-storage";

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("imposter setup storage", () => {
  it("reads and parses the saved setup", async () => {
    getItem.mockResolvedValue(JSON.stringify({ players: ["Ayşe", "Can", "Deniz"], voting: true }));
    const setup = await getStoredSetup();
    expect(getItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY);
    expect(setup.players).toEqual(["Ayşe", "Can", "Deniz"]);
    expect(setup.voting).toBe(true);
  });

  it("falls back to the defaults when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredSetup()).toEqual(DEFAULT_SETUP);
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredSetup(DEFAULT_SETUP)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY, JSON.stringify(DEFAULT_SETUP));
  });
});
