import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { CLUE_SETUP_STORAGE_KEY, defaultClueSetup, type ClueSetup } from "@ptracker/shared/clue-game";
import { getStoredClueSeen, getStoredClueSetup, setStoredClueSeen, setStoredClueSetup } from "./clue-game-storage";

const saved: ClueSetup = { players: ["Ayşe", "Burak", "Cem"], deckSize: 20, level: "hard" };

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("One Clue setup storage", () => {
  it("reads and parses the saved setup under its own key", async () => {
    getItem.mockResolvedValue(JSON.stringify(saved));
    expect(await getStoredClueSetup()).toEqual(saved);
    expect(getItem).toHaveBeenCalledWith(CLUE_SETUP_STORAGE_KEY);
    expect(CLUE_SETUP_STORAGE_KEY).toBe("clue_setup");
  });

  it("falls back to the defaults when nothing is saved or storage fails", async () => {
    getItem.mockResolvedValue(null);
    expect(await getStoredClueSetup()).toEqual(defaultClueSetup());
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredClueSetup()).toEqual(defaultClueSetup());
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredClueSetup(saved)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(CLUE_SETUP_STORAGE_KEY, JSON.stringify(saved));
  });
});

describe("One Clue seen storage", () => {
  it("keeps one list per language", async () => {
    getItem.mockResolvedValue('["animals-1", 3, "food-2", "animals-1"]');
    expect(await getStoredClueSeen("tr")).toEqual(["animals-1", "food-2"]);
    expect(getItem).toHaveBeenCalledWith("clue_seen_tr");
    await setStoredClueSeen("en", ["animals-1"]);
    expect(setItem).toHaveBeenCalledWith("clue_seen_en", '["animals-1"]');
  });

  it("reads an empty list and swallows write errors when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredClueSeen("en")).toEqual([]);
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredClueSeen("en", ["a"])).resolves.toBeUndefined();
  });
});
