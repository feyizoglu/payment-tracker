import { describe, it, expect } from "vitest";
import {
  SECRET_ALPHABET,
  SECRET_KEY_ROWS,
  SECRET_LEN,
  SECRET_TRIES,
  keyMarks,
  markGuess,
  newSecretRound,
  pickSecret,
  secretCards,
  secretDelete,
  secretLetter,
  secretLines,
  secretOpen,
  secretSubmit,
  secretType,
  secretUpper,
  type SecretCard,
  type SecretRound,
} from "@/lib/secret-word";
import type { WordCard } from "@/lib/word-game-words";

const card = (word: string, id = "animals-1"): SecretCard => ({ id, word, category: "animals" });
const typeAll = (r: SecretRound, word: string) => [...word].reduce(secretType, r);
const guess = (r: SecretRound, word: string) => secretSubmit(typeAll(r, word));

describe("letters", () => {
  it("upper-cases Turkish i and ı without the runtime's locale", () => {
    expect(secretUpper("tilki", "tr")).toBe("TİLKİ");
    expect(secretUpper("balık", "tr")).toBe("BALIK");
    expect(secretUpper("tilki", "en")).toBe("TILKI");
  });

  it("maps a typed key to its alphabet letter, and nothing else", () => {
    expect(secretLetter("i", "tr")).toBe("İ");
    expect(secretLetter("ı", "tr")).toBe("I");
    expect(secretLetter("ş", "tr")).toBe("Ş");
    expect(secretLetter("ş", "en")).toBeNull();
    expect(secretLetter("q", "tr")).toBeNull();
    expect(secretLetter("q", "en")).toBe("Q");
    expect(secretLetter("Enter", "en")).toBeNull();
    expect(secretLetter("1", "en")).toBeNull();
  });

  it("puts every letter of the alphabet on the keyboard exactly once", () => {
    for (const lang of ["tr", "en"] as const) {
      expect(SECRET_KEY_ROWS[lang].flat().sort()).toEqual([...SECRET_ALPHABET[lang]].sort());
    }
    expect(SECRET_ALPHABET.tr).toHaveLength(29);
  });
});

describe("secretCards", () => {
  it("makes every answer five letters of its own alphabet, with no word twice", () => {
    for (const lang of ["tr", "en"] as const) {
      const cards = secretCards(lang);
      expect(cards.length).toBeGreaterThan(300);
      for (const c of cards) {
        expect([...c.word]).toHaveLength(SECRET_LEN);
        expect([...c.word].every((l) => SECRET_ALPHABET[lang].includes(l))).toBe(true);
        expect(c.category).not.toBe("idioms");
      }
      expect(new Set(cards.map((c) => c.word)).size).toBe(cards.length);
      expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    }
  });

  it("skips idioms, other lengths, other letters and repeats, keeping the first card", () => {
    const row = (id: string, word: string): WordCard => ({ id, word, level: "easy", forbidden: ["a", "b", "c", "d"] });
    const empty = { animals: [], food: [], jobs: [], places: [], objects: [], sports: [], home: [], nature: [], body: [], transport: [], arts: [], actions: [], idioms: [] };
    const cards = secretCards("en", {
      ...empty,
      animals: [row("animals-1", "Tiger"), row("animals-2", "Cat"), row("animals-3", "T-Rex"), row("animals-4", "Yo yo")],
      food: [row("food-1", "tiger"), row("food-2", "Apple")],
      idioms: [row("idioms-1", "Hello")],
    });
    expect(cards).toEqual([
      { id: "animals-1", word: "TIGER", category: "animals" },
      { id: "food-2", word: "APPLE", category: "food" },
    ]);
  });
});

describe("pickSecret", () => {
  const cards = [card("AAAAA", "a"), card("BBBBB", "b"), card("CCCCC", "c")];

  it("deals an unseen word and adds it to the seen list", () => {
    const out = pickSecret(cards, ["a", "b"], () => 0.99);
    expect(out.card.id).toBe("c");
    expect(out.seen).toEqual(["a", "b", "c"]);
  });

  it("starts over once every word was seen, never with the word just played", () => {
    const out = pickSecret(cards, ["old", "a", "b", "c"], () => 0.99);
    expect(out.card.id).toBe("b");
    expect(out.seen).toEqual(["old", "b"]);
    expect(pickSecret(cards, ["a", "b", "c"], () => 0).card.id).toBe("a");
    expect(pickSecret(cards, ["b", "c", "a"], () => 0).card.id).toBe("b");
  });
});

describe("markGuess", () => {
  it("marks right place, elsewhere and not in the word", () => {
    expect(markGuess("KAYAK", "KÖPEK")).toEqual(["hit", "miss", "miss", "miss", "hit"]);
    expect(markGuess("PEKÖK", "KÖPEK")).toEqual(["near", "near", "near", "near", "hit"]);
  });

  it("marks a repeated letter only as often as the answer has it", () => {
    // TİLKİ has two İ: one is matched in place, so only one more guessed İ is elsewhere.
    expect(markGuess("İİİAA", "TİLKİ")).toEqual(["near", "hit", "miss", "miss", "miss"]);
    expect(markGuess("İAİAİ", "TİLKİ")).toEqual(["near", "miss", "miss", "miss", "hit"]);
    // SÜLÜK: the right-place Ü takes one Ü, the other Ü is still left for one more.
    expect(markGuess("ÜÜÜAA", "SÜLÜK")).toEqual(["near", "hit", "miss", "miss", "miss"]);
    // An exact match is counted before an earlier wrong-place copy.
    expect(markGuess("EEEEK", "KÖPEK")).toEqual(["miss", "miss", "miss", "hit", "hit"]);
  });
});

describe("keyMarks", () => {
  it("keeps each letter's best mark, which only improves", () => {
    expect(keyMarks(["KAYAK"], "ÖRDEK")).toEqual({ K: "hit", A: "miss", Y: "miss" });
    expect(keyMarks(["EKMEK", "TEKİR"], "ÖRDEK").E).toBe("hit");
    expect(keyMarks(["DEKEZ"], "ÖRDEK").D).toBe("near");
    expect(keyMarks(["DEKEZ", "ZZDZZ"], "ÖRDEK").D).toBe("hit");
    expect(keyMarks(["ZZDZZ", "DEKEZ"], "ÖRDEK").D).toBe("hit");
  });
});

describe("a round", () => {
  const start = () => newSecretRound(card("KÖPEK"), "tr");

  it("types at most five letters of the alphabet and deletes the last", () => {
    let r = typeAll(start(), "ABCDEF");
    expect(r.typed).toBe("ABCDE");
    expect(secretType(r, "Q")).toBe(r);
    r = secretDelete(r);
    expect(r.typed).toBe("ABCD");
    expect(secretType(start(), "Q")).toEqual(start());
  });

  it("refuses a short guess and says so until the next key", () => {
    const r = secretSubmit(typeAll(start(), "KÖP"));
    expect(r.guesses).toEqual([]);
    expect(r.short).toBe(true);
    expect(secretSubmit(r)).toBe(r);
    expect(secretType(r, "E").short).toBe(false);
    expect(secretDelete(r).short).toBe(false);
  });

  it("wins on the answer", () => {
    const r = guess(guess(start(), "KAYAK"), "KÖPEK");
    expect(r).toMatchObject({ phase: "won", guesses: ["KAYAK", "KÖPEK"], typed: "" });
    expect(secretType(r, "A")).toBe(r);
    expect(secretSubmit(r)).toBe(r);
  });

  it("loses after the sixth wrong guess", () => {
    let r = start();
    for (let i = 0; i < SECRET_TRIES - 1; i++) r = guess(r, "KAYAK");
    expect(r.phase).toBe("playing");
    r = guess(r, "KAYAK");
    expect(r.phase).toBe("lost");
    expect(r.guesses).toHaveLength(SECRET_TRIES);
  });

  it("is open once a guess was made or a streak runs", () => {
    expect(secretOpen(null, 3)).toBe(false);
    expect(secretOpen(start(), 0)).toBe(false);
    expect(secretOpen(start(), 1)).toBe(true);
    expect(secretOpen(guess(start(), "KAYAK"), 0)).toBe(true);
    expect(secretOpen(guess(start(), "KÖPEK"), 2)).toBe(false);
  });
});

describe("secretLines", () => {
  it("writes the marked guesses, then the typed letters, then empty lines, six in all", () => {
    const r = typeAll(guess(newSecretRound(card("KÖPEK"), "tr"), "KAYAK"), "KÖ");
    const lines = secretLines(r);
    expect(lines).toHaveLength(SECRET_TRIES);
    expect(lines[0].map((s) => s.mark)).toEqual(["hit", "miss", "miss", "miss", "hit"]);
    expect(lines[1]).toEqual([
      { letter: "K", mark: "typed" },
      { letter: "Ö", mark: "typed" },
      { letter: "", mark: "empty" },
      { letter: "", mark: "empty" },
      { letter: "", mark: "empty" },
    ]);
    expect(lines[5].every((s) => s.mark === "empty")).toBe(true);
  });

  it("has no typing line once the round is over", () => {
    const lines = secretLines(guess(newSecretRound(card("KÖPEK"), "tr"), "KÖPEK"));
    expect(lines[0].every((s) => s.mark === "hit")).toBe(true);
    expect(lines.slice(1).flat().every((s) => s.mark === "empty")).toBe(true);
  });
});
