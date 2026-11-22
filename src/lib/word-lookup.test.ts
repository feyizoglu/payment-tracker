import { describe, it, expect, vi } from "vitest";
import { lookupWord, parseEntries, readLookupResult } from "@/lib/word-lookup";

const json = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  );

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

  it("falls back to the first https recording when none is a US one", () => {
    const parsed = parseEntries([{
      phonetics: [{ audio: "http://example.com/x-us.mp3" }, { audio: "https://example.com/x-uk.mp3" }, { audio: "https://example.com/x-au.mp3" }],
      meanings: [],
    }]);
    expect(parsed?.audioUrl).toBe("https://example.com/x-uk.mp3");
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

describe("readLookupResult", () => {
  const found = { lookup: "found", ipa: "/b/", audioUrl: "https://a/b-us.mp3", senses: [{ pos: "noun", definition: "a plan", example: "a tight budget" }] };

  it("keeps a well-formed found result and trims its text", () => {
    expect(readLookupResult(found)).toEqual(found);
    expect(readLookupResult({ ...found, ipa: "  /b/ ", senses: [{ pos: " noun ", definition: " a plan " }] })).toEqual({
      ...found, senses: [{ pos: "noun", definition: "a plan" }],
    });
  });

  it("empties a not_found or failed result whatever else was sent", () => {
    expect(readLookupResult({ lookup: "failed", ipa: "/x/", senses: [{ pos: "n", definition: "d" }] })).toEqual({ lookup: "failed", ipa: null, audioUrl: null, senses: [] });
    expect(readLookupResult({ lookup: "not_found" })).toEqual({ lookup: "not_found", ipa: null, audioUrl: null, senses: [] });
  });

  it("refuses malformed results", () => {
    const bad = [
      null,
      "found",
      { lookup: "maybe" },
      { ...found, audioUrl: "http://a/b.mp3" },
      { ...found, ipa: 5 },
      { ...found, ipa: "x".repeat(101) },
      { ...found, senses: "none" },
      { ...found, senses: [{ pos: "noun" }] },
      { ...found, senses: [{ pos: "noun", definition: "d", example: "e".repeat(601) }] },
      { ...found, senses: Array.from({ length: 41 }, () => ({ pos: "n", definition: "d" })) },
    ];
    for (const raw of bad) expect(readLookupResult(raw)).toBeNull();
  });
});

describe("lookupWord without AbortSignal.timeout", () => {
  it("still sends a signal that ends the request", async () => {
    const original = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
    try {
      const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response("[]", { status: 404 });
      });
      expect((await lookupWord("zzz", fetchImpl)).lookup).toBe("not_found");
    } finally {
      Object.defineProperty(AbortSignal, "timeout", { value: original, configurable: true });
    }
  });
});
