import { describe, it, expect } from "vitest";
import type { VocabWord } from "@/lib/vocab";
import {
  RACE_BEST_KEY,
  RACE_LIST_KEY,
  RACE_MS,
  RACE_PENALTY_MS,
  canRace,
  nextRaceQuestion,
  parseRaceList,
  pickRace,
  raceClue,
  raceOver,
  raceTimeLeft,
  raceWords,
  startRace,
  type RaceState,
} from "@/lib/word-race";

function word(id: string, over: Partial<VocabWord> = {}): VocabWord {
  return {
    id,
    user_id: "u1",
    word: id,
    word_key: id,
    meaning_tr: `anlam ${id}`,
    ipa: null,
    audio_url: null,
    senses: [],
    lookup: "found",
    streak: 0,
    learned_at: null,
    reviewed_at: null,
    created_at: "2026-11-25T10:00:00Z",
    ...over,
  };
}

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = 1_000_000;
const four = () => ["a", "b", "c", "d"].map((id) => word(id));
const wrongChoice = (s: RaceState) => s.question.choices.find((c) => c.id !== s.question.id)!.id;

describe("keys", () => {
  it("stores the best and the offline list under fixed keys", () => {
    expect(RACE_BEST_KEY).toBe("words-race-best");
    expect(RACE_LIST_KEY).toBe("words-race-list");
  });
});

describe("raceClue", () => {
  it("uses the Turkish meaning first", () => {
    expect(raceClue(word("budget", { meaning_tr: " bütçe ", senses: [{ pos: "noun", definition: "a plan" }] }))).toBe("bütçe");
  });

  it("falls back to the first definition with the word masked", () => {
    const w = word("budget", {
      meaning_tr: null,
      senses: [
        { pos: "noun", definition: "A Budget is a plan; budgets limit budgeted and budgeting money, not budgetary." },
        { pos: "verb", definition: "second" },
      ],
    });
    expect(raceClue(w)).toBe("A ___ is a plan; ___ limit ___ and ___ money, not budgetary.");
  });

  it("masks the -es and -d forms", () => {
    const w = word("wish", { meaning_tr: null, senses: [{ pos: "verb", definition: "she wishes what he wished" }] });
    expect(raceClue(w)).toBe("she ___ what he ___");
    const t = word("thrive", { meaning_tr: null, senses: [{ pos: "verb", definition: "it thrived" }] });
    expect(raceClue(t)).toBe("it ___");
  });

  it("masks a phrase as a whole", () => {
    const w = word("give up", { meaning_tr: null, senses: [{ pos: "verb", definition: "to give up hope" }] });
    expect(raceClue(w)).toBe("to ___ hope");
  });

  it("treats a blank meaning as none", () => {
    expect(raceClue(word("x", { meaning_tr: "  ", senses: [{ pos: "noun", definition: "a letter" }] }))).toBe("a letter");
  });

  it("has no clue without a meaning or a definition", () => {
    expect(raceClue(word("x", { meaning_tr: null, senses: [] }))).toBeNull();
  });
});

describe("raceWords and canRace", () => {
  it("asks learned words too, but not words without a clue", () => {
    const list = [
      word("a", { learned_at: "2026-11-25T11:00:00Z", streak: 3 }),
      word("b", { meaning_tr: null }),
      word("c", { meaning_tr: " ", senses: [{ pos: "noun", definition: "a letter" }] }),
      word("d", { meaning_tr: " ", senses: [{ pos: "noun", definition: "  " }] }),
    ];
    expect(raceWords(list).map((w) => w.id)).toEqual(["a", "c"]);
  });

  it("needs four words that can be asked", () => {
    expect(canRace(four())).toBe(true);
    expect(canRace([...four().slice(0, 3), word("e", { meaning_tr: null })])).toBe(false);
  });
});

describe("startRace", () => {
  it("refuses a list that cannot race", () => {
    expect(startRace(four().slice(0, 3), NOW, seeded(1))).toBeNull();
  });

  it("starts a 60 second round with the answer among four different choices", () => {
    const s = startRace(four(), NOW, seeded(1))!;
    expect(s.endsAt).toBe(NOW + RACE_MS);
    expect(s.score).toBe(0);
    expect(s.combo).toBe(0);
    expect(s.picked).toBeNull();
    const ids = s.question.choices.map((c) => c.id);
    expect(ids).toContain(s.question.id);
    expect(new Set(ids).size).toBe(4);
    expect(s.question.clue).toBe(`anlam ${s.question.id}`);
    expect(s.question.choices.find((c) => c.id === s.question.id)!.word).toBe(s.question.id);
  });

  it("offers words that cannot be asked as wrong choices", () => {
    const list = [...four(), word("e", { meaning_tr: null })];
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const s = startRace(list, NOW, seeded(seed))!;
      expect(s.question.id).not.toBe("e");
      for (const c of s.question.choices) seen.add(c.id);
    }
    expect(seen.has("e")).toBe(true);
  });

  it("never offers a word whose clue reads the same as the answer's", () => {
    const list = [
      word("a", { meaning_tr: "büyük" }),
      word("b", { meaning_tr: "  BÜYÜK " }),
      word("c", { meaning_tr: "küçük" }),
      word("d", { meaning_tr: "orta" }),
      word("e", { meaning_tr: "uzun" }),
      word("f", { meaning_tr: "kısa" }),
    ];
    let checked = 0;
    for (let seed = 1; seed < 40; seed++) {
      const s = startRace(list, NOW, seeded(seed))!;
      const ids = s.question.choices.map((c) => c.id);
      if (s.question.id === "a") expect(ids).not.toContain("b");
      if (s.question.id === "b") expect(ids).not.toContain("a");
      if (s.question.id === "a" || s.question.id === "b") checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("folds Turkish dotted and dotless I when comparing clues", () => {
    const list = [word("a", { meaning_tr: "İyi" }), word("b", { meaning_tr: "iyi" }), word("c"), word("d")];
    let checked = 0;
    for (let seed = 1; seed < 40; seed++) {
      const s = startRace(list, NOW, seeded(seed))!;
      const ids = s.question.choices.map((c) => c.id);
      if (s.question.id === "a") {
        expect(ids).not.toContain("b");
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("shows fewer choices when there are not enough other words", () => {
    const list = [word("a", { meaning_tr: "aynı" }), word("b", { meaning_tr: "aynı" }), word("c"), word("d")];
    let checked = 0;
    for (let seed = 1; seed < 40; seed++) {
      const s = startRace(list, NOW, seeded(seed))!;
      if (s.question.id === "a") {
        expect(s.question.choices.map((c) => c.id).sort()).toEqual(["a", "c", "d"]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("the deck", () => {
  function askedIds(list: VocabWord[], count: number, seed: number): string[] {
    const rng = seeded(seed);
    let s = startRace(list, NOW, rng)!;
    const asked = [s.question.id];
    for (let i = 1; i < count; i++) {
      s = nextRaceQuestion(pickRace(s, s.question.id, NOW), rng);
      asked.push(s.question.id);
    }
    return asked;
  }

  it("asks every word once before any comes again", () => {
    for (let seed = 1; seed < 20; seed++) {
      const asked = askedIds(four(), 8, seed);
      expect(new Set(asked.slice(0, 4)).size).toBe(4);
      expect(new Set(asked.slice(4, 8)).size).toBe(4);
    }
  });

  it("never asks the same word twice in a row", () => {
    for (let seed = 1; seed < 50; seed++) {
      const asked = askedIds(four(), 40, seed);
      for (let i = 1; i < asked.length; i++) expect(asked[i]).not.toBe(asked[i - 1]);
    }
  });
});

describe("pickRace", () => {
  it("scores a right answer and raises the combo", () => {
    const rng = seeded(2);
    let s = startRace(four(), NOW, rng)!;
    for (let i = 0; i < 3; i++) s = nextRaceQuestion(pickRace(s, s.question.id, NOW + i), rng);
    expect(s.score).toBe(3);
    expect(s.combo).toBe(3);
    expect(s.bestCombo).toBe(3);
  });

  it("marks the pick until the next question", () => {
    const s = startRace(four(), NOW, seeded(3))!;
    const right = pickRace(s, s.question.id, NOW);
    expect(right.picked).toEqual({ id: s.question.id, correct: true });
    const wrong = pickRace(s, wrongChoice(s), NOW);
    expect(wrong.picked).toEqual({ id: wrongChoice(s), correct: false });
  });

  it("moves the deadline 3 seconds earlier, resets the combo and keeps the missed word once", () => {
    const rng = seeded(4);
    let s = startRace(four(), NOW, rng)!;
    s = nextRaceQuestion(pickRace(s, s.question.id, NOW), rng);
    const missed = s.question.id;
    const after = pickRace(s, wrongChoice(s), NOW + 1);
    expect(after.endsAt).toBe(NOW + RACE_MS - RACE_PENALTY_MS);
    expect(after.combo).toBe(0);
    expect(after.bestCombo).toBe(1);
    expect(after.score).toBe(1);
    expect(after.missed).toEqual([missed]);
    // The same word missed again later is listed once.
    const again = { ...nextRaceQuestion(after, rng), question: after.question };
    expect(pickRace(again, wrongChoice(again), NOW + 2).missed).toEqual([missed]);
  });

  it("ignores a second tap before the next question", () => {
    const s = startRace(four(), NOW, seeded(5))!;
    const once = pickRace(s, s.question.id, NOW);
    expect(pickRace(once, wrongChoice(s), NOW + 10)).toBe(once);
  });

  it("ignores a choice that is not on screen", () => {
    const s = startRace([...four(), word("e"), word("f")], NOW, seeded(6))!;
    const off = ["a", "b", "c", "d", "e", "f"].find((id) => !s.question.choices.some((c) => c.id === id))!;
    expect(pickRace(s, off, NOW)).toBe(s);
  });

  it("ignores taps at or after the deadline", () => {
    const s = startRace(four(), NOW, seeded(7))!;
    expect(pickRace(s, s.question.id, NOW + RACE_MS)).toBe(s);
    expect(pickRace(s, s.question.id, NOW + RACE_MS + 5)).toBe(s);
  });

  it("ends the round at once when a penalty crosses the deadline", () => {
    const s = startRace(four(), NOW, seeded(8))!;
    const late = NOW + RACE_MS - 1000;
    const after = pickRace(s, wrongChoice(s), late);
    expect(raceOver(after, late)).toBe(true);
    expect(raceTimeLeft(after, late)).toBe(0);
  });
});

describe("nextRaceQuestion", () => {
  it("does nothing until a choice was picked", () => {
    const s = startRace(four(), NOW, seeded(9))!;
    expect(nextRaceQuestion(s, seeded(9))).toBe(s);
  });

  it("clears the pick and asks another word", () => {
    const s = startRace(four(), NOW, seeded(10))!;
    const next = nextRaceQuestion(pickRace(s, s.question.id, NOW), seeded(10));
    expect(next.picked).toBeNull();
    expect(next.question.id).not.toBe(s.question.id);
  });
});

describe("the clock", () => {
  it("counts down to zero and ends at the deadline", () => {
    const s = startRace(four(), NOW, seeded(11))!;
    expect(raceTimeLeft(s, NOW)).toBe(RACE_MS);
    expect(raceTimeLeft(s, NOW + RACE_MS - 1)).toBe(1);
    expect(raceOver(s, NOW + RACE_MS - 1)).toBe(false);
    expect(raceOver(s, NOW + RACE_MS)).toBe(true);
    expect(raceTimeLeft(s, NOW + RACE_MS + 500)).toBe(0);
  });
});

describe("parseRaceList", () => {
  const list = four();

  it("reads a saved list back", () => {
    expect(parseRaceList(JSON.stringify(list), "u1")).toEqual(list);
    expect(parseRaceList(JSON.stringify(list), null)).toEqual(list);
  });

  it("reads nothing from a missing or broken copy", () => {
    for (const raw of [null, "", "{", "5", "{}", JSON.stringify([{ id: "a" }]), JSON.stringify([{ ...list[0], senses: [{}] }])]) {
      expect(parseRaceList(raw, "u1")).toBeNull();
    }
  });

  it("ignores another user's copy", () => {
    expect(parseRaceList(JSON.stringify(list), "u2")).toBeNull();
  });
});
