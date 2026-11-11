import { describe, it, expect } from "vitest";
import { IMPOSTER_CATEGORIES, IMPOSTER_WORDS } from "../../shared/imposter-words";

describe("imposter word list", () => {
  it("has the six categories with at least 40 entries each", () => {
    expect([...IMPOSTER_CATEGORIES]).toEqual(["animals", "food", "jobs", "places", "objects", "sports"]);
    for (const category of IMPOSTER_CATEGORIES) {
      expect(IMPOSTER_WORDS[category].length).toBeGreaterThanOrEqual(40);
    }
  });

  it("fills word and pair in both languages, and word differs from pair", () => {
    for (const category of IMPOSTER_CATEGORIES) {
      for (const entry of IMPOSTER_WORDS[category]) {
        for (const lang of ["tr", "en"] as const) {
          expect(entry[lang].word.trim()).not.toBe("");
          expect(entry[lang].pair.trim()).not.toBe("");
          expect(entry[lang].word.toLocaleLowerCase()).not.toBe(entry[lang].pair.toLocaleLowerCase());
        }
      }
    }
  });

  it("has no duplicate word within a category per language", () => {
    for (const category of IMPOSTER_CATEGORIES) {
      for (const lang of ["tr", "en"] as const) {
        const words = IMPOSTER_WORDS[category].map((e) => e[lang].word.toLocaleLowerCase());
        expect(new Set(words).size).toBe(words.length);
      }
    }
  });
});
