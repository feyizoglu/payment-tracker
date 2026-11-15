import { describe, it, expect } from "vitest";
import { SCALE_PAIRS } from "./scale-pairs";

const LANGS = [
  ["tr", "tr-TR"],
  ["en", "en-US"],
] as const;

const MIN_PAIRS = 200;
const MAX_SIDE = 24;

describe.each(LANGS)("%s Scale pairs", (lang, locale) => {
  const list = SCALE_PAIRS[lang];
  const key = (s: string) => s.toLocaleLowerCase(locale).replace(/[^\p{L}\p{N}]+/gu, "");

  it("has enough pairs", () => {
    expect(list.length).toBeGreaterThanOrEqual(MIN_PAIRS);
  });

  it("gives every pair its position as id", () => {
    list.forEach((p, i) => expect(p.id).toBe(`${lang}-${i + 1}`));
  });

  it("keeps every side to one short trimmed line with a capital and no full stop", () => {
    const bad = list.filter((p) =>
      [p.left, p.right].some((s) => {
        const first = [...s][0] ?? "";
        return (
          s.trim() === "" ||
          s !== s.trim() ||
          /\s{2,}|[\r\n\t]/.test(s) ||
          [...s].length > MAX_SIDE ||
          s.endsWith(".") ||
          first !== first.toLocaleUpperCase(locale)
        );
      })
    );
    expect(bad.map((p) => `${p.id}: ${p.left} / ${p.right}`)).toEqual([]);
  });

  it("uses every pair once, in either order, and never the same word on both sides", () => {
    const keys = list.map((p) => [key(p.left), key(p.right)].sort().join("|"));
    const clashes = list.flatMap((p, i) => {
      const first = keys.indexOf(keys[i]);
      return first === i ? [] : [`${p.id} ~ ${list[first].id}: ${p.left} / ${p.right}`];
    });
    expect(clashes).toEqual([]);
    expect(list.filter((p) => key(p.left) === key(p.right)).map((p) => p.id)).toEqual([]);
  });
});

describe("tr Scale pairs", () => {
  it("are written without circumflexes", () => {
    const bad = SCALE_PAIRS.tr.filter((p) => /[âîûÂÎÛ]/.test(p.left + p.right));
    expect(bad.map((p) => `${p.id}: ${p.left} / ${p.right}`)).toEqual([]);
  });
});
