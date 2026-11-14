import { describe, it, expect } from "vitest";
import { HOT_POTATO_PROMPTS } from "./hot-potato-prompts";

const LANGS = [
  ["tr", "tr-TR"],
  ["en", "en-US"],
] as const;

const MIN_PROMPTS = 250;
const MAX_LENGTH = 60;

describe.each(LANGS)("%s Hot Potato tasks", (lang, locale) => {
  const list = HOT_POTATO_PROMPTS[lang];
  // Near-duplicates are the same task: case, spacing, quotes and punctuation do not count.
  const key = (s: string) =>
    s
      .trim()
      .toLocaleLowerCase(locale)
      .replace(/[\s'’"“”.,!?;:()-]+/g, " ")
      .trim();

  it("has enough tasks", () => {
    expect(list.length).toBeGreaterThanOrEqual(MIN_PROMPTS);
  });

  it("gives every task its position as id", () => {
    list.forEach((p, i) => expect(p.id).toBe(`${lang}-${i + 1}`));
  });

  it("uses every task once, near-duplicates included", () => {
    const keys = list.map((p) => key(p.text));
    const clashes = list.flatMap((p, i) => {
      const first = keys.indexOf(keys[i]);
      return first === i ? [] : [`${p.text} (${p.id}) ~ ${list[first].text} (${list[first].id})`];
    });
    expect(clashes).toEqual([]);
  });

  it("keeps every task to one trimmed line of at most 60 characters with no full stop", () => {
    const bad = list.filter(
      (p) =>
        p.text.trim() === "" ||
        p.text !== p.text.trim() ||
        /\s{2,}|[\r\n\t]/.test(p.text) ||
        [...p.text].length > MAX_LENGTH ||
        p.text.endsWith(".")
    );
    expect(bad.map((p) => `${p.id}: ${p.text}`)).toEqual([]);
  });

  it("starts every task with a capital letter", () => {
    const bad = list.filter((p) => {
      const first = [...p.text][0];
      return first !== first.toLocaleUpperCase(locale);
    });
    expect(bad.map((p) => `${p.id}: ${p.text}`)).toEqual([]);
  });
});
