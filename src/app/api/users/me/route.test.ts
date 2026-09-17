import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { GET } from "./route";

// Minimal stub of the fluent chain GET uses:
// .from("users").select(...).eq("id", ...).maybeSingle() → { data, error }
// maybeSingle is what makes the zero-row case `data: null` with no error;
// `single()` would surface it as a PGRST116 error instead.
function makeDb(result: { data?: unknown; error?: unknown }) {
  const calls: { selected?: string; column?: string; value?: unknown } = {};
  const db = {
    _calls: calls,
    from() {
      const builder = {
        select: (cols: string) => {
          calls.selected = cols;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          calls.column = column;
          calls.value = value;
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
      };
      return builder;
    },
  };
  return db;
}

const get = () => new Request("http://localhost/api/users/me");

const profile = {
  id: "u-1",
  email: "a@x.com",
  name: "Ada",
  avatar_url: "https://img/a.png",
  color: "#ff0000",
};

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
  vi.mocked(supabaseAdmin).mockReset();
});

describe("GET /api/users/me", () => {
  it("401s without a session, without touching the database", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null as never);

    const res = await GET(get() as never);

    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("returns the caller's profile, looked up by the session's user id", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@x.com" } as never);
    const db = makeDb({ data: profile });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await GET(get() as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(profile);
    // The JWT carries the id; looking up by it avoids trusting the email as a key.
    expect(db._calls.column).toBe("id");
    expect(db._calls.value).toBe("u-1");
  });

  it("selects the colour too, so the profile matches what PATCH can change", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@x.com" } as never);
    const db = makeDb({ data: profile });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    await GET(get() as never);

    expect(db._calls.selected).toContain("color");
  });

  it("404s when the session is valid but the user row is gone", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@x.com" } as never);
    vi.mocked(supabaseAdmin).mockReturnValue(makeDb({ data: null }) as never);

    const res = await GET(get() as never);

    expect(res.status).toBe(404);
  });

  it("500s with the database message when the lookup fails", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@x.com" } as never);
    vi.mocked(supabaseAdmin).mockReturnValue(
      makeDb({ data: null, error: { message: "connection reset" } }) as never
    );

    const res = await GET(get() as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "connection reset" });
  });
});
