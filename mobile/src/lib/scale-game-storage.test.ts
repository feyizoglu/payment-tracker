import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { SCALE_SETUP_STORAGE_KEY, defaultScaleSetup, type ScaleSetup } from "@ptracker/shared/scale-game";
import { getStoredScaleSeen, getStoredScaleSetup, setStoredScaleSeen, setStoredScaleSetup } from "./scale-game-storage";

const TEAMS = ["Takım 1", "Takım 2"] as const;
const saved: ScaleSetup = {
  teams: [
    { name: "Kırmızı", players: ["Ayşe", "Can"] },
    { name: "Mavi", players: ["Ece", "Mert"] },
  ],
  turns: 8,
};

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("Scale setup storage", () => {
  it("reads and parses the saved setup under its own key", async () => {
    getItem.mockResolvedValue(JSON.stringify(saved));
    expect(await getStoredScaleSetup(TEAMS)).toEqual(saved);
    expect(getItem).toHaveBeenCalledWith(SCALE_SETUP_STORAGE_KEY);
    expect(SCALE_SETUP_STORAGE_KEY).toBe("scale_setup");
  });

  it("keeps each saved field only when it is valid", async () => {
    getItem.mockResolvedValue(JSON.stringify({ ...saved, turns: 5 }));
    expect(await getStoredScaleSetup(TEAMS)).toEqual({ ...saved, turns: 6 });
  });

  it("falls back to the defaults when nothing is saved or storage fails", async () => {
    getItem.mockResolvedValue(null);
    expect(await getStoredScaleSetup(TEAMS)).toEqual(defaultScaleSetup(TEAMS));
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredScaleSetup(TEAMS)).toEqual(defaultScaleSetup(TEAMS));
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredScaleSetup(saved)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(SCALE_SETUP_STORAGE_KEY, JSON.stringify(saved));
  });
});

describe("Scale pairs played storage", () => {
  it("keeps one list per language", async () => {
    getItem.mockResolvedValue('["tr-1", 3, "tr-2", "tr-1"]');
    expect(await getStoredScaleSeen("tr")).toEqual(["tr-1", "tr-2"]);
    expect(getItem).toHaveBeenCalledWith("scale_seen_tr");
    await setStoredScaleSeen("en", ["en-4"]);
    expect(setItem).toHaveBeenCalledWith("scale_seen_en", '["en-4"]');
  });

  it("reads an empty list and swallows write errors when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredScaleSeen("en")).toEqual([]);
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredScaleSeen("en", ["en-1"])).resolves.toBeUndefined();
  });
});
