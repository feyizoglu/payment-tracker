import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { DEFAULT_SETUP, SETUP_STORAGE_KEY } from "@ptracker/shared/wolf-game";
import { getStoredWolfSetup, setStoredWolfSetup } from "./wolf-game-storage";

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("Wolf Night setup storage", () => {
  it("reads and parses the saved setup under its own key", async () => {
    getItem.mockResolvedValue(JSON.stringify({ players: ["Ayşe", "Can"], night: "narrator" }));
    const setup = await getStoredWolfSetup();
    expect(getItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY);
    expect(SETUP_STORAGE_KEY).toBe("wolf_setup");
    expect(setup.players).toEqual(["Ayşe", "Can"]);
    expect(setup.night).toBe("narrator");
  });

  it("falls back to the defaults when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredWolfSetup()).toEqual(DEFAULT_SETUP);
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredWolfSetup(DEFAULT_SETUP)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY, JSON.stringify(DEFAULT_SETUP));
  });
});
