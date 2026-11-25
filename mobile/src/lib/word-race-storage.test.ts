import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VocabWord } from "@ptracker/shared/vocab";

const store = vi.hoisted(() => ({ map: new Map<string, string>(), fail: false }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => {
      if (store.fail) throw new Error("disk");
      return store.map.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (store.fail) throw new Error("disk");
      store.map.set(k, v);
    },
    removeItem: async (k: string) => {
      if (store.fail) throw new Error("disk");
      store.map.delete(k);
    },
  },
}));
import {
  clearStoredRaceList,
  getStoredRaceBest,
  getStoredRaceList,
  setStoredRaceBest,
  setStoredRaceList,
} from "@/lib/word-race-storage";

const list: VocabWord[] = [
  {
    id: "w1", user_id: "u1", word: "budget", word_key: "budget", meaning_tr: "bütçe", ipa: null, audio_url: null,
    senses: [], lookup: "found", streak: 0, learned_at: null, reviewed_at: null, created_at: "2026-11-25T10:00:00Z",
  },
];

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe("word race storage", () => {
  it("keeps the best under its own key", async () => {
    expect(await getStoredRaceBest()).toBe(0);
    await setStoredRaceBest(7);
    expect(store.map.get("words-race-best")).toBe("7");
    expect(await getStoredRaceBest()).toBe(7);
  });

  it("reads the saved list back for its user and not for another", async () => {
    expect(await getStoredRaceList("u1")).toBeNull();
    await setStoredRaceList(list);
    expect(await getStoredRaceList("u1")).toEqual(list);
    expect(await getStoredRaceList("u2")).toBeNull();
  });

  it("forgets the list when cleared", async () => {
    await setStoredRaceList(list);
    await clearStoredRaceList();
    expect(await getStoredRaceList("u1")).toBeNull();
  });

  it("never throws when storage fails", async () => {
    store.fail = true;
    expect(await getStoredRaceBest()).toBeNull();
    expect(await getStoredRaceList("u1")).toBeNull();
    await expect(setStoredRaceList(list)).resolves.toBeUndefined();
    await expect(clearStoredRaceList()).resolves.toBeUndefined();
  });
});
