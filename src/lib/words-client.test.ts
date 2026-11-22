import { describe, it, expect, vi, afterEach } from "vitest";
import { addWord, changeWord, deleteWord, listWords } from "@/lib/words-client";

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("words client", () => {
  it("returns the list on success", async () => {
    respond(200, [{ id: "w1" }]);
    expect(await listWords()).toEqual({ ok: true, data: [{ id: "w1" }] });
  });

  it("posts a new word and returns the error code and existing row on a duplicate", async () => {
    respond(409, { error: "Already in your list", code: "duplicate", word: { id: "w1" } });
    const res = await addWord("budget", "");
    expect(res).toEqual({ ok: false, status: 409, code: "duplicate", error: "Already in your list", word: { id: "w1" } });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/words");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ word: "budget", meaningTr: "" });
  });

  it("patches and deletes by id", async () => {
    respond(200, { id: "w1" });
    await changeWord("w1", { answer: "know" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/words/w1");
    respond(200, { ok: true });
    expect((await deleteWord("w1")).ok).toBe(true);
  });

  it("reports a network failure as status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await listWords()).toEqual({ ok: false, status: 0, code: undefined, error: "" });
  });
});
