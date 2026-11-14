import { describe, it, expect } from "vitest";
import { WORD_CATEGORIES, WORD_GAME_WORDS } from "./word-game-words";
import { POTATO_CANDIDATE_LETTERS, POTATO_CATEGORIES, POTATO_LETTERS } from "../../shared/hot-potato-letters";

const LANGS = [
  ["tr", "tr-TR"],
  ["en", "en-US"],
] as const;

const MIN_WORDS = 5;

describe.each(LANGS)("%s Hot Potato letters", (lang, locale) => {
  const table = POTATO_LETTERS[lang];

  it("covers every Describe It category but idioms", () => {
    expect(Object.keys(table).sort()).toEqual(WORD_CATEGORIES.filter((c) => c !== "idioms").sort());
    expect(POTATO_CATEGORIES).not.toContain("idioms");
    expect(Object.keys(table)).not.toContain("idioms");
  });

  it("uses only the language's candidate letters, each once per category", () => {
    const candidates = [...POTATO_CANDIDATE_LETTERS[lang]];
    for (const category of POTATO_CATEGORIES) {
      const letters = [...table[category]];
      expect(letters.length).toBeGreaterThan(0);
      expect(new Set(letters).size).toBe(letters.length);
      expect(letters.filter((l) => !candidates.includes(l))).toEqual([]);
    }
  });

  it("asks only for letters that start at least 5 words of the category", () => {
    // First letters in the language's locale, so TR I and İ stay different letters.
    const short = POTATO_CATEGORIES.flatMap((category) =>
      [...table[category]].flatMap((letter) => {
        const count = WORD_GAME_WORDS[lang][category].filter(
          (card) => [...card.word.trim()][0].toLocaleUpperCase(locale) === letter
        ).length;
        return count >= MIN_WORDS ? [] : [`${category} ${letter}: ${count}`];
      })
    );
    expect(short).toEqual([]);
  });
});

describe("Hot Potato candidate letters", () => {
  it("leave out Ğ and J in Turkish and Q, X and Z in English", () => {
    expect([...POTATO_CANDIDATE_LETTERS.tr]).toEqual("A B C Ç D E F G H I İ K L M N O Ö P R S Ş T U Ü V Y Z".split(" "));
    expect([...POTATO_CANDIDATE_LETTERS.en]).toEqual("A B C D E F G H I J K L M N O P R S T U V W Y".split(" "));
  });
});
