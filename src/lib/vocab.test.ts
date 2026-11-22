import { describe, it, expect } from "vitest";
import {
  VOCAB_MEANING_MAX,
  VOCAB_WORD_MAX,
  filterWords,
  isValidWord,
  normalizeMeaning,
  normalizeWord,
  reviewRound,
  senseGroups,
  vocabErrorText,
  vocabProgress,
  vocabWordKey,
  type VocabWord,
} from "@/lib/vocab";
import { translationsFor } from "@/lib/i18n";

function word(over: Partial<VocabWord>): VocabWord {
  return {
    id: over.id ?? "w",
    user_id: "u",
    word: over.word ?? "budget",
    word_key: (over.word ?? "budget").toLowerCase(),
    meaning_tr: null,
    ipa: null,
    audio_url: null,
    senses: [],
    lookup: "found",
    streak: 0,
    learned_at: null,
    reviewed_at: null,
    created_at: "2026-11-22T10:00:00Z",
    ...over,
  };
}

describe("word validation", () => {
  it("trims, collapses inner spaces and straightens curly apostrophes", () => {
    expect(normalizeWord("  give   up ")).toBe("give up");
    expect(normalizeWord("don’t")).toBe("don't");
  });

  it("accepts letters with single spaces, hyphens and apostrophes between them", () => {
    for (const w of ["budget", "give up", "well-known", "don't", "Budget"]) expect(isValidWord(w)).toBe(true);
  });

  it("refuses empty, digits, other scripts, edge punctuation and over-long words", () => {
    for (const w of ["", "abc1", "çiçek", "-abc", "abc'", "a--b", "a".repeat(VOCAB_WORD_MAX + 1)]) {
      expect(isValidWord(w)).toBe(false);
    }
    expect(isValidWord("a".repeat(VOCAB_WORD_MAX))).toBe(true);
  });

  it("keys a word by its lowercase form", () => {
    expect(vocabWordKey("Give Up")).toBe("give up");
  });
});

describe("meaning validation", () => {
  it("treats missing and blank as no meaning", () => {
    expect(normalizeMeaning(undefined)).toEqual({ ok: true, value: null });
    expect(normalizeMeaning(null)).toEqual({ ok: true, value: null });
    expect(normalizeMeaning("   ")).toEqual({ ok: true, value: null });
  });

  it("trims a meaning and refuses non-strings or over-long text", () => {
    expect(normalizeMeaning(" bütçe ")).toEqual({ ok: true, value: "bütçe" });
    expect(normalizeMeaning("x".repeat(VOCAB_MEANING_MAX))).toEqual({ ok: true, value: "x".repeat(VOCAB_MEANING_MAX) });
    expect(normalizeMeaning("x".repeat(VOCAB_MEANING_MAX + 1))).toEqual({ ok: false });
    expect(normalizeMeaning(5)).toEqual({ ok: false });
  });
});

describe("progress, filter and search", () => {
  const list = [
    word({ id: "a", word: "budget", meaning_tr: "bütçe" }),
    word({ id: "b", word: "give up", learned_at: "2026-11-22T11:00:00Z", streak: 3 }),
    word({ id: "c", word: "thrive" }),
  ];

  it("counts all and learned words", () => {
    expect(vocabProgress(list)).toEqual({ total: 3, learned: 1 });
  });

  it("filters by learning state", () => {
    expect(filterWords(list, "learning", "").map((w) => w.id)).toEqual(["a", "c"]);
    expect(filterWords(list, "learned", "").map((w) => w.id)).toEqual(["b"]);
    expect(filterWords(list, "all", "").map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("finds a word with a capital I by its plain lowercase form", () => {
    const words = [word({ id: "i", word: "Internet", meaning_tr: "Küresel ağ" })];
    expect(filterWords(words, "all", "internet").map((w) => w.id)).toEqual(["i"]);
    expect(filterWords(words, "all", "INTER").map((w) => w.id)).toEqual(["i"]);
    expect(filterWords(words, "all", "KÜRESEL").map((w) => w.id)).toEqual(["i"]);
    expect(filterWords(words, "all", "İnter").map((w) => w.id)).toEqual(["i"]);
  });

  it("searches the word and the Turkish meaning, ignoring case", () => {
    expect(filterWords(list, "all", "BÜT").map((w) => w.id)).toEqual(["a"]);
    expect(filterWords(list, "all", " give ").map((w) => w.id)).toEqual(["b"]);
  });
});

describe("review round", () => {
  it("takes unlearned words, lowest streak first, then never reviewed, then longest unreviewed, then oldest", () => {
    const list = [
      word({ id: "learned", learned_at: "2026-11-22T11:00:00Z", streak: 3 }),
      word({ id: "s2", streak: 2, reviewed_at: "2026-11-20T00:00:00Z" }),
      word({ id: "s0-recent", streak: 0, reviewed_at: "2026-11-21T00:00:00Z" }),
      word({ id: "s0-old", streak: 0, reviewed_at: "2026-11-19T00:00:00Z" }),
      word({ id: "s0-never-new", streak: 0, created_at: "2026-11-22T09:00:00Z" }),
      word({ id: "s0-never-old", streak: 0, created_at: "2026-11-01T09:00:00Z" }),
    ];
    expect(reviewRound(list).map((w) => w.id)).toEqual(["s0-never-old", "s0-never-new", "s0-old", "s0-recent", "s2"]);
  });

  it("stops at the round size", () => {
    const list = Array.from({ length: 15 }, (_, i) => word({ id: String(i) }));
    expect(reviewRound(list)).toHaveLength(10);
    expect(reviewRound(list, 3)).toHaveLength(3);
  });
});

describe("senses and errors", () => {
  it("groups senses by part of speech in first-seen order", () => {
    const groups = senseGroups([
      { pos: "noun", definition: "a" },
      { pos: "verb", definition: "b" },
      { pos: "noun", definition: "c", example: "e" },
    ]);
    expect(groups).toEqual([
      { pos: "noun", senses: [{ pos: "noun", definition: "a" }, { pos: "noun", definition: "c", example: "e" }] },
      { pos: "verb", senses: [{ pos: "verb", definition: "b" }] },
    ]);
  });

  it("turns known codes into the language's text and falls back otherwise", () => {
    const tr = translationsFor("tr");
    expect(vocabErrorText("duplicate", "x", tr)).toBe(tr.wordsDuplicate);
    expect(vocabErrorText("invalid_word", "x", tr)).toBe(tr.wordsInvalidWord);
    expect(vocabErrorText("invalid_meaning", "x", tr)).toBe(tr.wordsInvalidMeaning);
    expect(vocabErrorText("not_found", "x", tr)).toBe(tr.wordsNotFound);
    expect(vocabErrorText("something", "Server says no", tr)).toBe("Server says no");
    expect(vocabErrorText(undefined, "", tr)).toBe(tr.updateFailed);
  });
});
