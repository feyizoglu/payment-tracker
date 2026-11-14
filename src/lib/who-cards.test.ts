import { describe, it, expect } from "vitest";
import {
  WHO_CHARACTER_FILES,
  WHO_CHARACTERS,
  WHO_PEOPLE,
  WHO_PEOPLE_FILES,
  WHO_REGIONS,
  type WhoCard,
} from "./who-cards";

const LOCALES = { tr: "tr-TR", en: "en-US" } as const;
const MAX_NAME = 40;
const MAX_HINT = 50;

const MIN_PEOPLE = 2500;
const MIN_PEOPLE_WORLD = 1750;
const MIN_PEOPLE_TR = 650;
const MIN_PEOPLE_PER_REGION_LEVEL = 150;
const MIN_CHARACTERS = 1000;

const key = (s: string, locale: string) =>
  s
    .toLocaleLowerCase(locale)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const words = (s: string, locale: string) =>
  s
    .toLocaleLowerCase(locale)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

function checkFiles(files: Readonly<Record<string, readonly WhoCard[]>>) {
  it("gives every card its position in its file as id", () => {
    const bad = Object.entries(files).flatMap(([prefix, list]) =>
      list.flatMap((c, i) => (c.id === `${prefix}-${i + 1}` ? [] : [`${c.id} (expected ${prefix}-${i + 1})`]))
    );
    expect(bad).toEqual([]);
  });
}

function checkCards(label: string, list: readonly WhoCard[]) {
  const show = (c: WhoCard) => `${c.id}: ${c.name.tr} / ${c.name.en}`;

  it(`keeps every ${label} field filled, trimmed, single-spaced and within length`, () => {
    const bad = list.filter((c) =>
      (["tr", "en"] as const).some((lang) => {
        const fields = [c.name[lang], c.hint[lang]];
        return (
          fields.some((f) => f.trim() === "" || f !== f.trim() || /\s{2,}|[\r\n\t]/.test(f)) ||
          [...c.name[lang]].length > MAX_NAME ||
          [...c.hint[lang]].length > MAX_HINT ||
          c.hint[lang].endsWith(".")
        );
      })
    );
    expect(bad.map(show)).toEqual([]);
  });

  it(`gives every ${label} card a known region and level`, () => {
    const bad = list.filter((c) => !WHO_REGIONS.includes(c.region) || !["easy", "hard"].includes(c.level));
    expect(bad.map(show)).toEqual([]);
  });

  it(`never gives a ${label} card away in its hint`, () => {
    // Long name words may not start a hint word ("Mozart" in "Mozart'ın"); short ones may not
    // appear as a whole hint word, except particles that many names share.
    const particles = new Set(["the", "of", "and", "de", "da", "di", "du", "la", "le", "el", "van", "von", "bin", "ve", "ile", "mr", "mrs", "dr"]);
    const bad = list.filter((c) =>
      (["tr", "en"] as const).some((lang) => {
        const locale = LOCALES[lang];
        const hintWords = words(c.hint[lang], locale);
        return words(c.name[lang], locale).some((w) =>
          [...w].length > 3 ? hintWords.some((h) => h.startsWith(w)) : !particles.has(w) && hintWords.includes(w)
        );
      })
    );
    expect(bad.map((c) => `${show(c)} — ${c.hint.tr} / ${c.hint.en}`)).toEqual([]);
  });

  it(`uses every ${label} name once in each language`, () => {
    const clashes = (["tr", "en"] as const).flatMap((lang) => {
      const keys = list.map((c) => key(c.name[lang], LOCALES[lang]));
      return list.flatMap((c, i) => {
        const first = keys.indexOf(keys[i]);
        return first === i ? [] : [`${lang}: ${show(c)} ~ ${show(list[first])}`];
      });
    });
    expect(clashes).toEqual([]);
  });

  it(`writes the Turkish ${label} text without circumflexes`, () => {
    const bad = list.filter((c) => /[âîûÂÎÛ]/.test(c.name.tr + c.hint.tr));
    expect(bad.map(show)).toEqual([]);
  });
}

describe("Who Am I? people", () => {
  checkFiles(WHO_PEOPLE_FILES);
  checkCards("people", WHO_PEOPLE);

  it("has enough people in each region and level", () => {
    const count = (f: (c: WhoCard) => boolean) => WHO_PEOPLE.filter(f).length;
    expect(WHO_PEOPLE.length).toBeGreaterThanOrEqual(MIN_PEOPLE);
    expect(count((c) => c.region === "world")).toBeGreaterThanOrEqual(MIN_PEOPLE_WORLD);
    expect(count((c) => c.region === "tr")).toBeGreaterThanOrEqual(MIN_PEOPLE_TR);
    for (const region of WHO_REGIONS) {
      for (const level of ["easy", "hard"] as const) {
        expect(count((c) => c.region === region && c.level === level), `${region} ${level}`).toBeGreaterThanOrEqual(
          MIN_PEOPLE_PER_REGION_LEVEL
        );
      }
    }
  });
});

describe("Who Am I? characters", () => {
  checkFiles(WHO_CHARACTER_FILES);
  checkCards("characters", WHO_CHARACTERS);

  it("has enough characters", () => {
    expect(WHO_CHARACTERS.length).toBeGreaterThanOrEqual(MIN_CHARACTERS);
  });
});
