import { describe, it, expect } from "vitest";
import { WORD_CATEGORIES, WORD_GAME_WORDS, type WordCard } from "./word-game-words";

const LANGS = [
  ["tr", "tr-TR"],
  ["en", "en-US"],
] as const;

const MIN_PER_CATEGORY = 90;
const MIN_PER_LEVEL = 35;

describe.each(LANGS)("%s word list", (lang, locale) => {
  const norm = (s: string) => s.trim().toLocaleLowerCase(locale);
  const all: WordCard[] = WORD_CATEGORIES.flatMap((c) => WORD_GAME_WORDS[lang][c]);

  it("uses every id and every word once across the language", () => {
    const ids = all.map((c) => c.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const words = all.map((c) => norm(c.word));
    expect(all.filter((_, i) => words.indexOf(words[i]) !== i).map((c) => c.word)).toEqual([]);
  });

  describe.each(WORD_CATEGORIES)(`${lang} %s`, (category) => {
    const list = WORD_GAME_WORDS[lang][category];

    it("has enough easy and hard words", () => {
      expect(list.length).toBeGreaterThanOrEqual(MIN_PER_CATEGORY);
      expect(list.filter((c) => c.level === "easy").length).toBeGreaterThanOrEqual(MIN_PER_LEVEL);
      expect(list.filter((c) => c.level === "hard").length).toBeGreaterThanOrEqual(MIN_PER_LEVEL);
    });

    it("gives every card its category id, a word and a known level", () => {
      list.forEach((card, i) => {
        expect(card.id).toBe(`${category}-${i + 1}`);
        expect(card.word.trim()).not.toBe("");
        expect(card.word).toBe(card.word.trim());
        expect(["easy", "hard"]).toContain(card.level);
      });
    });

    it("gives every card 4 different forbidden words that do not give the word away", () => {
      const bad = list.filter((card) => {
        const word = norm(card.word);
        const forbidden = card.forbidden.map(norm);
        return (
          forbidden.length !== 4 ||
          forbidden.some((f) => f === "") ||
          new Set(forbidden).size !== 4 ||
          forbidden.some((f) => f.includes(word) || word.includes(f))
        );
      });
      expect(bad.map((c) => `${c.word}: ${c.forbidden.join(", ")}`)).toEqual([]);
    });
  });
});
