import type { Lang } from "./i18n";
import { WORD_CATEGORIES, type WordCategory } from "./word-game-words/types";

export type PotatoCategory = Exclude<WordCategory, "idioms">;

/** The Describe It categories a letter task can name: all of them but idioms. */
export const POTATO_CATEGORIES: readonly PotatoCategory[] = WORD_CATEGORIES.filter(
  (c): c is PotatoCategory => c !== "idioms"
);

/** The letters a task may ask for, one character each. */
export const POTATO_CANDIDATE_LETTERS: Record<Lang, string> = {
  tr: "ABCÇDEFGHIİKLMNOÖPRSŞTUÜVYZ",
  en: "ABCDEFGHIJKLMNOPRSTUVWY",
};

// The candidate letters that start at least 5 words of the category in the language's
// Describe It list, generated once from those lists. Written out so the game does not load
// the word lists; src/lib/hot-potato-letters.test.ts checks every pair against them.
// Animals, food, jobs, places, objects and actions ask for the thing itself, so their letters
// were also checked by hand: at least 4 words of the list really are one (a real animal, a
// real verb, …). Check by hand again before adding a letter to them.
export const POTATO_LETTERS: Record<Lang, Record<PotatoCategory, string>> = {
  tr: {
    animals: "ABÇDEFGHİKLMOPSTY",
    food: "ABÇDEFGHKLMPSŞTY",
    jobs: "ABCÇDEFGHİKMOPSTV",
    places: "ABÇDEGHİKLMOPRSTY",
    objects: "ABCÇDEFGHİKMOPRSTYZ",
    sports: "ABÇDFGHKMOPRSŞTY",
    home: "ABÇDEFGKLMOPSŞTVY",
    nature: "ABÇDEFGKLMOPSTY",
    body: "ABDEGHİKMNPRSTUY",
    transport: "ABÇDEFGHİKMOPRSŞTUVY",
    arts: "ABÇDEFGHKMNOPRSTY",
    actions: "ABÇDEGHİKMNÖPSŞTUY",
  },
  en: {
    animals: "ABCDEFGHKLMOPRSTW",
    food: "ABCDEFGHKLMNOPRSTW",
    jobs: "ABCDEFGHILMNPRSTW",
    places: "ABCDEFGHILMNPRSTVW",
    objects: "ABCDEFGHKLMNPRSTW",
    sports: "ABCDFGHJKLMOPRSTW",
    home: "ABCDFGHKLMPRSTW",
    nature: "ABCDEFGHILMNOPRSTW",
    body: "ABCDEFGHILMNPRSTVW",
    transport: "ABCDEFGHILMOPRSTW",
    arts: "ABCDEFHLMPRST",
    actions: "ABCDEFGHIKLMPRSTW",
  },
};
