import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { PATCH } from "./route";

type Result = { data?: unknown; error?: unknown };

// Stub of the Supabase chains this handler uses. Every `.update(...)` is recorded with
// its `.eq` filters and resolves (via maybeSingle/single) to the next queued update
// result; reads resolve `.single()` to the next queued read for that table.
function makeDb(opts: { updates?: Result[]; reads?: Record<string, Result[]> } = {}) {
  const updates = opts.updates ?? [];
  const reads = opts.reads ?? {};
  const calls: Array<{ patch: unknown; filters: Array<[string, unknown]> }> = [];
  return {
    _updates: calls,
    from(table: string) {
      let call: (typeof calls)[number] | null = null;
      const next = () =>
        Promise.resolve(call ? (updates.shift() ?? { data: null, error: null }) : ((reads[table] ?? []).shift() ?? { data: null, error: null }));
      const builder = {
        update(patch: unknown) {
          call = { patch, filters: [] };
          calls.push(call);
          return builder;
        },
        select: () => builder,
        eq(col: string, val: unknown) {
          call?.filters.push([col, val]);
          return builder;
        },
        single: next,
        maybeSingle: next,
      };
      return builder;
    },
  };
}

const patch = (body: unknown) =>
  new Request("http://localhost/api/payments/p-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const params = { params: Promise.resolve({ id: "p-1" }) };
const row = { id: "p-1", user_id: "u-1", paid_installments: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
});

describe("PATCH /api/payments/[id]", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await PATCH(patch({ paid_installments: 3 }) as never, params);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("updates the creator's payment in a single filtered query", async () => {
    const db = makeDb({ updates: [{ data: row, error: null }] });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await PATCH(patch({ paid_installments: 3 }) as never, params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
    expect(db._updates).toEqual([
      { patch: { paid_installments: 3 }, filters: [["id", "p-1"], ["user_id", "u-1"]] },
    ]);
  });

  it("drops fields outside the editable set, such as the owner and team", async () => {
    const db = makeDb({ updates: [{ data: row, error: null }] });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    await PATCH(
      patch({ name: "Car", amount: 10, currency: "USD", total_installments: 6, user_id: "u-2", team_id: "t-9", id: "x" }) as never,
      params
    );

    expect(db._updates[0].patch).toEqual({ name: "Car", amount: 10, currency: "USD", total_installments: 6 });
  });

  it("400s without touching the database when no editable field is sent", async () => {
    const res = await PATCH(patch({ user_id: "u-2" }) as never, params);
    expect(res.status).toBe(400);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("lets the team owner update a member's payment", async () => {
    const db = makeDb({
      updates: [{ data: null, error: null }, { data: { ...row, user_id: "u-2" }, error: null }],
      reads: {
        payments: [{ data: { user_id: "u-2", team_id: "t-1" }, error: null }],
        team_members: [{ data: { role: "owner" }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await PATCH(patch({ paid_installments: 3 }) as never, params);

    expect(res.status).toBe(200);
    expect(db._updates[1]).toEqual({ patch: { paid_installments: 3 }, filters: [["id", "p-1"]] });
  });

  it("403s and writes nothing for someone who neither created it nor owns its team", async () => {
    const db = makeDb({
      updates: [{ data: null, error: null }],
      reads: {
        payments: [{ data: { user_id: "u-2", team_id: "t-1" }, error: null }],
        team_members: [{ data: { role: "member" }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await PATCH(patch({ paid_installments: 3 }) as never, params);

    expect(res.status).toBe(403);
    expect(db._updates).toHaveLength(1);
  });

  it("500s when the update fails", async () => {
    vi.mocked(supabaseAdmin).mockReturnValue(makeDb({ updates: [{ data: null, error: { message: "boom" } }] }) as never);
    const res = await PATCH(patch({ paid_installments: -1 }) as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
