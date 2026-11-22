import { describe, it, expect, vi, afterEach } from "vitest";
import { addWord, changeWord, deleteWord, listWords, relookupWord } from "@/lib/words-client";

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

const DICT = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const entry = [{ phonetic: "/b/", phonetics: [], meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "a plan", example: "a tight budget" }] }] }];
const found = { lookup: "found", ipa: "/b/", audioUrl: null, senses: [{ pos: "noun", definition: "a plan", example: "a tight budget" }] };

// The dictionary answers its own URL; everything else answers `status`/`body`.
const respondWithDictionary = (dict: { status: number; body: unknown }, status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).startsWith(DICT)
        ? new Response(JSON.stringify(dict.body), { status: dict.status })
        : new Response(JSON.stringify(body), { status })
    )
  );

afterEach(() => vi.unstubAllGlobals());

describe("words client", () => {
  it("returns the list on success", async () => {
    respond(200, [{ id: "w1" }]);
    expect(await listWords()).toEqual({ ok: true, data: [{ id: "w1" }] });
  });

  it("posts a new word and returns the error code and existing row on a duplicate", async () => {
    respondWithDictionary({ status: 200, body: entry }, 409, { error: "Already in your list", code: "duplicate", word: { id: "w1" } });
    const res = await addWord("budget", "");
    expect(res).toEqual({ ok: false, status: 409, code: "duplicate", error: "Already in your list", word: { id: "w1" } });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(DICT + "budget");
    const [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(url).toBe("/api/words");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ word: "budget", meaningTr: "", dictionary: found });
  });

  it("still saves the word when the dictionary does not answer, and says so", async () => {
    respondWithDictionary({ status: 429, body: {} }, 201, { id: "w1" });
    expect(await addWord("budget", "")).toEqual({ ok: true, data: { id: "w1" } });
    const [, init] = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(String((init as RequestInit).body)).dictionary).toEqual({ lookup: "failed", ipa: null, audioUrl: null, senses: [] });
  });

  it("looks a word up again on this device and sends the result", async () => {
    respondWithDictionary({ status: 200, body: entry }, 200, { id: "w1" });
    await relookupWord("w1", "budget");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(DICT + "budget");
    const [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(url).toBe("/api/words/w1");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ relookup: found });
  });

  it("patches and deletes by id", async () => {
    respond(200, { id: "w1" });
    await changeWord("w1", { answer: "know" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/words/w1");
    respond(200, { ok: true });
    expect((await deleteWord("w1")).ok).toBe(true);
  });

  it("sends the change as a PATCH body", async () => {
    respond(200, { id: "w1" });
    await changeWord("w1", { answer: "know" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as RequestInit).method).toBe("PATCH");
    expect((init as RequestInit).body).toBe('{"answer":"know"}');
  });

  it("deletes with the DELETE method on the word's url", async () => {
    respond(200, { ok: true });
    await deleteWord("w1");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/words/w1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("reports a network failure as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await listWords()).toEqual({ ok: false, status: 0, code: undefined, error: "" });
  });
});
