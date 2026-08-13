import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { POST } from "./route";

// .from("teams").insert(payload).select().single() → the created row;
// .from("team_members").insert(payload) → awaited directly.
function makeDb(team: { data?: unknown; error?: unknown } = { data: { id: "t-1" }, error: null }) {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const db = {
    _inserts: inserts,
    from(table: string) {
      const builder = {
        insert: (payload: unknown) => {
          inserts.push({ table, payload });
          return {
            select: () => ({ single: () => Promise.resolve(team) }),
            then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
          };
        },
      };
      return builder;
    },
  };
  return db;
}

const post = (body: unknown) =>
  new Request("http://localhost/api/teams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
  vi.mocked(supabaseAdmin).mockReset();
});

describe("POST /api/teams", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null as never);

    const res = await POST(post({ name: "Home" }) as never);

    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("400s on a blank name rather than creating a nameless team", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1" } as never);
    const db = makeDb();
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    for (const name of ["", "   ", null, 42]) {
      const res = await POST(post({ name }) as never);
      expect(res.status).toBe(400);
    }
    expect(db._inserts).toEqual([]);
  });

  it("trims the name and makes the creator an owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1" } as never);
    const db = makeDb();
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await POST(post({ name: "  Home  " }) as never);

    expect(res.status).toBe(201);
    expect(db._inserts).toEqual([
      { table: "teams", payload: { name: "Home", created_by: "u-1" } },
      { table: "team_members", payload: { team_id: "t-1", user_id: "u-1", role: "owner" } },
    ]);
  });
});
