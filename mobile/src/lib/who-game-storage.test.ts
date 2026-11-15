import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { WHO_SETUP_STORAGE_KEY, defaultWhoSetup, type WhoSetup } from "@ptracker/shared/who-game";
import { getStoredWhoSeen, getStoredWhoSetup, setStoredWhoSeen, setStoredWhoSetup } from "./who-game-storage";

const TEAMS = ["Takım 1", "Takım 2"] as const;
const saved: WhoSetup = { ...defaultWhoSetup("tr", TEAMS), players: ["Ayşe", "Can"], kinds: ["things"], turnSeconds: 30 };

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("Who Am I? setup storage", () => {
  it("reads and parses the saved setup under its own key", async () => {
    getItem.mockResolvedValue(JSON.stringify(saved));
    expect(await getStoredWhoSetup("tr", TEAMS)).toEqual(saved);
    expect(getItem).toHaveBeenCalledWith(WHO_SETUP_STORAGE_KEY);
    expect(WHO_SETUP_STORAGE_KEY).toBe("who_setup");
  });

  it("falls back to the language's defaults when nothing is saved or storage fails", async () => {
    getItem.mockResolvedValue(null);
    expect(await getStoredWhoSetup("en", TEAMS)).toEqual(defaultWhoSetup("en", TEAMS));
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredWhoSetup("tr", TEAMS)).toEqual(defaultWhoSetup("tr", TEAMS));
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredWhoSetup(saved)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(WHO_SETUP_STORAGE_KEY, JSON.stringify(saved));
  });
});

describe("Who Am I? seen storage", () => {
  it("keeps one list per language", async () => {
    getItem.mockResolvedValue('["p-1", 3, "p-2", "p-1"]');
    expect(await getStoredWhoSeen("tr")).toEqual(["p-1", "p-2"]);
    expect(getItem).toHaveBeenCalledWith("who_seen_tr");
    await setStoredWhoSeen("en", ["things:animals-1"]);
    expect(setItem).toHaveBeenCalledWith("who_seen_en", '["things:animals-1"]');
  });

  it("reads an empty list and swallows write errors when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredWhoSeen("en")).toEqual([]);
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredWhoSeen("en", ["a"])).resolves.toBeUndefined();
  });
});
