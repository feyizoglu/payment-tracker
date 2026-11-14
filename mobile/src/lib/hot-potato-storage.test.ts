import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { DEFAULT_SETUP, SETUP_STORAGE_KEY } from "@ptracker/shared/hot-potato";
import { getStoredPotatoSetup, setStoredPotatoSetup } from "./hot-potato-storage";

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("Hot Potato setup storage", () => {
  it("reads and parses the saved setup under its own key", async () => {
    getItem.mockResolvedValue(JSON.stringify({ players: ["Ayşe", "Can", "Ece"], lives: 5, fuse: "long", tasks: "letters" }));
    const setup = await getStoredPotatoSetup();
    expect(getItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY);
    expect(SETUP_STORAGE_KEY).toBe("potato_setup");
    expect(setup).toEqual({ players: ["Ayşe", "Can", "Ece"], lives: 5, fuse: "long", tasks: "letters" });
  });

  it("falls back to the defaults when nothing is saved or storage fails", async () => {
    getItem.mockResolvedValue(null);
    expect(await getStoredPotatoSetup()).toEqual(DEFAULT_SETUP);
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredPotatoSetup()).toEqual(DEFAULT_SETUP);
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredPotatoSetup(DEFAULT_SETUP)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY, JSON.stringify(DEFAULT_SETUP));
  });
});
