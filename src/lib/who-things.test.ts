import { describe, it, expect } from "vitest";
import { WHO_DECK_MIN, WHO_THING_CATEGORIES, defaultWhoSetup, whoPool } from "./who-game";
import { WHO_THINGS } from "./who-things";
import { WORD_GAME_WORDS } from "./word-game-words";

describe("Who Am I? things", () => {
  it("are the Describe It animals, jobs and objects in each language", () => {
    for (const lang of ["tr", "en"] as const) {
      expect(Object.keys(WHO_THINGS[lang])).toEqual([...WHO_THING_CATEGORIES]);
      for (const category of WHO_THING_CATEGORIES) expect(WHO_THINGS[lang][category]).toBe(WORD_GAME_WORDS[lang][category]);
    }
  });

  it("are enough for a game of things alone at every level, in both languages", () => {
    for (const lang of ["tr", "en"] as const) {
      for (const level of ["easy", "hard", "mixed"] as const) {
        const setup = { ...defaultWhoSetup(lang, ["1", "2"]), kinds: ["things" as const], level };
        const pool = whoPool(setup, { people: [], characters: [], things: WHO_THINGS }, lang);
        expect(pool.length, `${lang} ${level}`).toBeGreaterThanOrEqual(WHO_DECK_MIN);
      }
    }
  });
});
