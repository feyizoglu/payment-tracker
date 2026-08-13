import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { POST } from "./route";

// Minimal stub of the fluent chain this route uses:
// - membership lookup: .from("team_members").select().eq().eq().maybeSingle()
// - invited-user lookup: .from("users").select().eq().single()
// - write: .from("team_members").upsert(payload) → { error }
function makeDb(opts: {
  membership?: { data?: unknown };
  invitee?: { data?: unknown; error?: unknown };
  upsertError?: unknown;
} = {}) {
  const upserts: unknown[] = [];
  const db = {
    _upserts: upserts,
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(opts.membership ?? { data: null }),
        single: () => Promise.resolve(opts.invitee ?? { data: null, error: "not found" }),
        upsert: (payload: unknown) => {
          upserts.push({ table, payload });
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
      };
      return builder;
    },
  };
  return db;
}

const post = (body: unknown) =>
  new Request("http://localhost/api/teams/t-1/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const params = Promise.resolve({ id: "t-1" });

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
  vi.mocked(supabaseAdmin).mockReset();
});

describe("POST /api/teams/[id]/invite", () => {
  it("401s without a session, without touching the database", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null as never);

    const res = await POST(post({ email: "a@x.com" }) as never, { params });

    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("403s when the caller is not a member of the team", async () => {
    // The hole this closes: any signed-in user could previously add anyone to any team.
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-outsider" } as never);
    const db = makeDb({ membership: { data: null } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await POST(post({ email: "a@x.com" }) as never, { params });

    expect(res.status).toBe(403);
    expect(db._upserts).toEqual([]);
  });

  it("403s when the caller is a plain member rather than an owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-member" } as never);
    const db = makeDb({ membership: { data: { role: "member" } } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await POST(post({ email: "a@x.com" }) as never, { params });

    expect(res.status).toBe(403);
    expect(db._upserts).toEqual([]);
  });

  it("400s on a blank email before looking anyone up", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-owner" } as never);
    const db = makeDb({ membership: { data: { role: "owner" } } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await POST(post({ email: "   " }) as never, { params });

    expect(res.status).toBe(400);
    expect(db._upserts).toEqual([]);
  });

  it("404s when the invited email has never signed in", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-owner" } as never);
    const db = makeDb({
      membership: { data: { role: "owner" } },
      invitee: { data: null, error: "no rows" },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await POST(post({ email: "ghost@x.com" }) as never, { params });

    expect(res.status).toBe(404);
    expect(db._upserts).toEqual([]);
  });

  it("adds the member when an owner invites an existing user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-owner" } as never);
    const db = makeDb({
      membership: { data: { role: "owner" } },
      invitee: { data: { id: "u-invited" }, error: null },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await POST(post({ email: " a@x.com " }) as never, { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(db._upserts).toEqual([
      { table: "team_members", payload: { team_id: "t-1", user_id: "u-invited", role: "member" } },
    ]);
  });
});
