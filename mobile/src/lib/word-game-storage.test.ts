import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { WORD_SETUP_STORAGE_KEY, defaultWordSetup, type WordSetup } from "@ptracker/shared/word-game";
import { getStoredSeen, getStoredWordSetup, setStoredSeen, setStoredWordSetup } from "./word-game-storage";

const NAMES = ["Takım 1", "Takım 2"] as const;
const setup: WordSetup = {
  ...defaultWordSetup(NAMES),
  teams: [
    { name: "A", players: ["Ayşe", "Can"] },
    { name: "B", players: ["Deniz", "Ece"] },
  ],
  mode: "mime",
};

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("word game setup storage", () => {
  it("reads and parses the saved setup", async () => {
    getItem.mockResolvedValue(JSON.stringify(setup));
    expect(await getStoredWordSetup(NAMES)).toEqual(setup);
    expect(getItem).toHaveBeenCalledWith(WORD_SETUP_STORAGE_KEY);
  });

  it("falls back to the defaults with the given team names when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredWordSetup(NAMES)).toEqual(defaultWordSetup(NAMES));
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredWordSetup(setup)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(WORD_SETUP_STORAGE_KEY, JSON.stringify(setup));
  });
});

describe("word game seen list storage", () => {
  it("keeps one list per language", async () => {
    getItem.mockResolvedValue(JSON.stringify(["animals-1", "food-2"]));
    expect(await getStoredSeen("tr")).toEqual(["animals-1", "food-2"]);
    expect(getItem).toHaveBeenCalledWith("word_game_seen_tr");
    await setStoredSeen("en", ["arts-3"]);
    expect(setItem).toHaveBeenCalledWith("word_game_seen_en", JSON.stringify(["arts-3"]));
  });

  it("starts from an empty list when storage fails and swallows write errors", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredSeen("tr")).toEqual([]);
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredSeen("tr", ["animals-1"])).resolves.toBeUndefined();
  });
});
