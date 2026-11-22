import { describe, it, expect, vi } from "vitest";
import { lookupWord, parseEntries } from "@/lib/word-lookup";

const json = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const budget = [
  {
    word: "budget",
    phonetic: "",
    phonetics: [
      { text: "/ˈbʌdʒ.ɪt/", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/budget-uk.mp3" },
      { text: "", audio: "https://api.dictionaryapi.dev/media/pronunciations/en/budget-us.mp3" },
    ],
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          { definition: "d1", example: "e1" },
          { definition: "d2" },
          { definition: "d3" },
          { definition: "d4" },
        ],
      },
      { partOfSpeech: "verb", definitions: [{ definition: "v1", example: "ev1" }] },
    ],
  },
  { word: "budget", phonetics: [], meanings: [{ partOfSpeech: "adjective", definitions: [{ definition: "a1" }] }] },
];

describe("parseEntries", () => {
  it("takes the first IPA, prefers a US recording and keeps three senses per part of speech", () => {
    expect(parseEntries(budget)).toEqual({
      lookup: "found",
      ipa: "/ˈbʌdʒ.ɪt/",
      audioUrl: "https://api.dictionaryapi.dev/media/pronunciations/en/budget-us.mp3",
      senses: [
        { pos: "noun", definition: "d1", example: "e1" },
        { pos: "noun", definition: "d2" },
        { pos: "noun", definition: "d3" },
        { pos: "verb", definition: "v1", example: "ev1" },
        { pos: "adjective", definition: "a1" },
      ],
    });
  });

  it("leaves IPA and audio empty for a phrase without phonetics", () => {
    const parsed = parseEntries([{ word: "give up", phonetics: [], meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "To surrender" }] }] }]);
    expect(parsed).toEqual({ lookup: "found", ipa: null, audioUrl: null, senses: [{ pos: "verb", definition: "To surrender" }] });
  });

  it("drops a recording that is not https", () => {
    const parsed = parseEntries([{ phonetics: [{ text: "/x/", audio: "http://example.com/x.mp3" }], meanings: [] }]);
    expect(parsed?.audioUrl).toBeNull();
  });

  it("returns null for a body that is not a list of entries", () => {
    expect(parseEntries({ title: "No Definitions Found" })).toBeNull();
    expect(parseEntries([])).toBeNull();
  });
});

describe("lookupWord", () => {
  it("asks the dictionary for the encoded word", async () => {
    const fetchImpl = json(200, budget);
    const result = await lookupWord("give up", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.dictionaryapi.dev/api/v2/entries/en/give%20up");
    expect(result.lookup).toBe("found");
  });

  it("reports not_found on a 404", async () => {
    expect(await lookupWord("asdfqwer", json(404, { title: "No Definitions Found" }) as unknown as typeof fetch)).toEqual({
      lookup: "not_found", ipa: null, audioUrl: null, senses: [],
    });
  });

  it("reports failed on another status, a network error or an unreadable body", async () => {
    expect((await lookupWord("x", json(500, {}) as unknown as typeof fetch)).lookup).toBe("failed");
    const throwing = vi.fn(async () => { throw new Error("timeout"); });
    expect((await lookupWord("x", throwing as unknown as typeof fetch)).lookup).toBe("failed");
    const garbage = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect((await lookupWord("x", garbage as unknown as typeof fetch)).lookup).toBe("failed");
  });
});
