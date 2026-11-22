import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/word-lookup", () => ({ lookupWord: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { lookupWord } from "@/lib/word-lookup";
import { GET, POST } from "./route";

const me = { id: "u-1", email: "a@b.com" };
const post = (body: unknown) =>
  new Request("http://localhost/api/words", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// A chainable stand-in for the supabase query builder; each terminal call resolves `result`.
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "insert"]) q[m] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.single = vi.fn(async () => result);
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lookupWord).mockResolvedValue({ lookup: "found", ipa: "/x/", audioUrl: null, senses: [] });
});

describe("GET /api/words", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/words") as never)).status).toBe(401);
  });

  it("lists only the caller's words, newest first", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const q = query({ data: [{ id: "w1" }], error: null });
    vi.mocked(supabaseAdmin).mockReturnValue({ from: vi.fn(() => q) } as never);
    const res = await GET(new Request("http://localhost/api/words") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "w1" }]);
    expect(q.eq).toHaveBeenCalledWith("user_id", "u-1");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("500s with the database error message", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const q = query({ data: null, error: { message: "boom" } });
    vi.mocked(supabaseAdmin).mockReturnValue({ from: vi.fn(() => q) } as never);
    const res = await GET(new Request("http://localhost/api/words") as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST /api/words", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await POST(post({ word: "budget" }) as never)).status).toBe(401);
  });

  it("400s with code invalid_word before touching the database", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const res = await POST(post({ word: "abc1" }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_word");
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("400s with code invalid_meaning on an over-long meaning", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const res = await POST(post({ word: "budget", meaningTr: "x".repeat(201) }) as never);
    expect((await res.json()).code).toBe("invalid_meaning");
  });

  it("409s with the existing row when the word is already in the list, without a lookup", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const existing = query({ data: { id: "w1", word: "budget" }, error: null });
    vi.mocked(supabaseAdmin).mockReturnValue({ from: vi.fn(() => existing) } as never);
    const res = await POST(post({ word: " Budget " }) as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "duplicate", word: { id: "w1" } });
    expect(existing.eq).toHaveBeenCalledWith("word_key", "budget");
    expect(existing.eq).toHaveBeenCalledWith("user_id", "u-1");
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it("looks the word up and inserts it with the lookup result", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const none = query({ data: null, error: null });
    const inserted = query({ data: { id: "w2", word: "give up" }, error: null });
    const from = vi.fn().mockReturnValueOnce(none).mockReturnValueOnce(inserted);
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);
    const res = await POST(post({ word: "give   up", meaningTr: " vazgeçmek " }) as never);
    expect(res.status).toBe(201);
    expect(lookupWord).toHaveBeenCalledWith("give up");
    expect(inserted.insert).toHaveBeenCalledWith({
      user_id: "u-1", word: "give up", word_key: "give up", meaning_tr: "vazgeçmek",
      ipa: "/x/", audio_url: null, senses: [], lookup: "found",
    });
  });

  it("answers 409 when a parallel insert won the unique key", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const none = query({ data: null, error: null });
    const clash = query({ data: null, error: { code: "23505", message: "duplicate key" } });
    const winner = query({ data: { id: "w3" }, error: null });
    const from = vi.fn().mockReturnValueOnce(none).mockReturnValueOnce(clash).mockReturnValueOnce(winner);
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);
    const res = await POST(post({ word: "budget" }) as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "duplicate", word: { id: "w3" } });
    expect(winner.eq).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("500s on any other insert error without looking the word up again", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(me);
    const none = query({ data: null, error: null });
    const broken = query({ data: null, error: { code: "42P01", message: "boom" } });
    const winner = query({ data: { id: "w3" }, error: null });
    const from = vi.fn().mockReturnValueOnce(none).mockReturnValueOnce(broken).mockReturnValueOnce(winner);
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);
    const res = await POST(post({ word: "budget" }) as never);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
    expect(from).toHaveBeenCalledTimes(2);
  });
});
