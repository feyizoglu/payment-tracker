import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/word-lookup", () => ({ lookupWord: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { lookupWord } from "@/lib/word-lookup";
import { DELETE, PATCH } from "./route";

const me = { id: "u-1", email: "a@b.com" };
const params = { params: Promise.resolve({ id: "w1" }) };
const patch = (body: unknown) =>
  new Request("http://localhost/api/words/w1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "delete"]) q[m] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.single = vi.fn(async () => result);
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
}

const own = { id: "w1", user_id: "u-1", word: "budget", streak: 1, learned_at: null };

function db(...results: unknown[]) {
  const queries = results.map(query);
  const from = vi.fn();
  for (const q of queries) from.mockReturnValueOnce(q);
  const rpc = vi.fn(async () => ({ data: [{ ...own, streak: 2 }], error: null }));
  vi.mocked(supabaseAdmin).mockReturnValue({ from, rpc } as never);
  return { queries, from, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(me);
});

describe("PATCH /api/words/[id]", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await PATCH(patch({ unlearn: true }) as never, params)).status).toBe(401);
  });

  it("400s unless exactly one change is sent", async () => {
    for (const body of [{}, { unlearn: true, relookup: true }, null]) {
      const res = await PATCH(patch(body) as never, params);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_request");
    }
  });

  it("404s with code not_found for another user's word", async () => {
    const { queries } = db({ data: null, error: null });
    const res = await PATCH(patch({ unlearn: true }) as never, params);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
    expect(queries[0].eq).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("sets or clears the Turkish meaning", async () => {
    const { queries } = db({ data: own, error: null }, { data: { ...own, meaning_tr: "bütçe" }, error: null });
    const res = await PATCH(patch({ meaningTr: " bütçe " }) as never, params);
    expect(res.status).toBe(200);
    expect(queries[1].update).toHaveBeenCalledWith({ meaning_tr: "bütçe" });
  });

  it("400s on an invalid meaning", async () => {
    db({ data: own, error: null });
    const res = await PATCH(patch({ meaningTr: "x".repeat(201) }) as never, params);
    expect((await res.json()).code).toBe("invalid_meaning");
  });

  it("records an answer through the one-statement function", async () => {
    const { rpc } = db({ data: own, error: null });
    const res = await PATCH(patch({ answer: "know" }) as never, params);
    expect(rpc).toHaveBeenCalledWith("vocab_word_answer", { p_id: "w1", p_user: "u-1", p_know: true });
    expect(await res.json()).toMatchObject({ streak: 2 });
  });

  it("returns a learned word unchanged when the function updates nothing", async () => {
    const learned = { ...own, streak: 3, learned_at: "2026-11-22T00:00:00Z" };
    const { rpc } = db({ data: learned, error: null });
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const res = await PATCH(patch({ answer: "dontKnow" }) as never, params);
    expect(rpc).toHaveBeenCalledWith("vocab_word_answer", { p_id: "w1", p_user: "u-1", p_know: false });
    expect(await res.json()).toEqual(learned);
  });

  it("400s on an unknown answer", async () => {
    db({ data: own, error: null });
    expect((await PATCH(patch({ answer: "maybe" }) as never, params)).status).toBe(400);
  });

  it("marks a word as not learned", async () => {
    const { queries } = db({ data: own, error: null }, { data: own, error: null });
    await PATCH(patch({ unlearn: true }) as never, params);
    expect(queries[1].update).toHaveBeenCalledWith({ streak: 0, learned_at: null });
  });

  it("looks the word up again and stores the result", async () => {
    vi.mocked(lookupWord).mockResolvedValue({ lookup: "found", ipa: "/b/", audioUrl: "https://a/b-us.mp3", senses: [{ pos: "noun", definition: "d" }] });
    const { queries } = db({ data: own, error: null }, { data: own, error: null });
    await PATCH(patch({ relookup: true }) as never, params);
    expect(lookupWord).toHaveBeenCalledWith("budget");
    expect(queries[1].update).toHaveBeenCalledWith({
      ipa: "/b/", audio_url: "https://a/b-us.mp3", senses: [{ pos: "noun", definition: "d" }], lookup: "found",
    });
  });
});

describe("DELETE /api/words/[id]", () => {
  it("deletes only the caller's word", async () => {
    const { queries } = db({ data: [{ id: "w1" }], error: null });
    const res = await DELETE(new Request("http://localhost/api/words/w1", { method: "DELETE" }) as never, params);
    expect(res.status).toBe(200);
    expect(queries[0].eq).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("404s when nothing was deleted", async () => {
    db({ data: [], error: null });
    const res = await DELETE(new Request("http://localhost/api/words/w1", { method: "DELETE" }) as never, params);
    expect(res.status).toBe(404);
  });
});
