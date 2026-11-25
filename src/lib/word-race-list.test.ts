import { describe, it, expect, vi, afterEach } from "vitest";
import type { VocabWord } from "@/lib/vocab";
import { RACE_LIST_KEY } from "@/lib/word-race";
import { readRaceList, writeRaceList } from "@/lib/word-race-list";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(store: Map<string, string>, fail = false) {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (fail) throw new Error("SecurityError");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (fail) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
  });
}

const list: VocabWord[] = [
  {
    id: "w1", user_id: "u1", word: "budget", word_key: "budget", meaning_tr: "bütçe", ipa: null, audio_url: null,
    senses: [], lookup: "found", streak: 0, learned_at: null, reviewed_at: null, created_at: "2026-11-25T10:00:00Z",
  },
];

describe("race list copy", () => {
  it("reads back the saved list for its own user only", () => {
    const store = new Map<string, string>();
    stubStorage(store);
    expect(readRaceList("u1")).toBeNull();
    writeRaceList(list);
    expect(store.has(RACE_LIST_KEY)).toBe(true);
    expect(readRaceList("u1")).toEqual(list);
    expect(readRaceList("u2")).toBeNull();
  });

  it("reads null and writes nothing when the browser refuses storage", () => {
    stubStorage(new Map(), true);
    expect(readRaceList("u1")).toBeNull();
    expect(() => writeRaceList(list)).not.toThrow();
  });
});
