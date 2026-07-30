import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
// supabaseAdmin must never be constructed on the 401 path below.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));
// Amount cleaning and day-change merging are unit-tested in payments.test.ts; mock
// them so this handler's branching (needsClear / hasAmounts / neither) is deterministic.
vi.mock("@/lib/payments", () => ({
  cleanCurrencyAmounts: vi.fn(),
  upsertDayChange: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanCurrencyAmounts, upsertDayChange } from "@/lib/payments";
import { PUT } from "./route";

// Minimal stub of the Supabase fluent chain this route uses:
// - reads: `.from(t).select(...).eq(...).single()` / `.maybeSingle()` → shifts the
//   next queued result for table `t` ("recurring_payments" is read twice: ownership,
//   then day_changes; "recurring_entries" is read once via maybeSingle).
// - `.from("recurring_payments").update(payload).eq(...)` is awaited → { error }.
// - `.from("recurring_entries").upsert(payload, opts)` is awaited → { error }.
// Writes are recorded so payloads can be asserted.
function makeDb(opts: {
  reads?: Record<string, Array<{ data?: unknown; error?: unknown }>>;
  writes?: Record<string, Array<{ error?: unknown }>>;
} = {}) {
  const reads = opts.reads ?? {};
  const writes = opts.writes ?? {};
  const upserts: Array<{ table: string; payload: unknown; opts: unknown }> = [];
  const updates: Array<{ table: string; payload: unknown }> = [];
  const db = {
    _upserts: upserts,
    _updates: updates,
    from(table: string) {
      const read = () =>
        Promise.resolve((reads[table] ?? []).shift() ?? { data: null, error: null });
      const write = () =>
        Promise.resolve((writes[table] ?? []).shift() ?? { error: null });
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: read,
        maybeSingle: read,
        update: (payload: unknown) => {
          updates.push({ table, payload });
          return { eq: () => write() };
        },
        upsert: (payload: unknown, o: unknown) => {
          upserts.push({ table, payload, opts: o });
          return write();
        },
      };
      return builder;
    },
  };
  return db;
}

const put = (body: unknown) =>
  new Request("http://localhost/api/recurring/r-1/day-forward", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const params = { params: Promise.resolve({ id: "r-1" }) };
const owner = { data: { user_id: "u-1", team_id: null }, error: null };
const dayChangesRow = { data: { day_changes: [] }, error: null };
const nextDayChanges = [{ from: "2025-05-01", day: 20 }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cleanCurrencyAmounts).mockReturnValue({ amounts: null });
  vi.mocked(upsertDayChange).mockReturnValue(nextDayChanges);
});

describe("PUT /api/recurring/[id]/day-forward", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("403s when the caller neither owns the series nor owns its team", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(supabaseAdmin).mockReturnValue(
      makeDb({
        reads: {
          recurring_payments: [{ data: { user_id: "someone-else", team_id: null }, error: null }],
        },
      }) as never
    );
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(403);
  });

  it("allows a team owner who does not personally own the series", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const teamRow = { data: { user_id: "someone-else", team_id: "t-1" }, error: null };
    const db = makeDb({
      reads: {
        recurring_payments: [teamRow, dayChangesRow],
        team_members: [{ data: { role: "owner" }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(200);
    expect(db._updates).toHaveLength(1);
  });

  it("403s a team member who is not the team owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const teamRow = { data: { user_id: "someone-else", team_id: "t-1" }, error: null };
    const db = makeDb({
      reads: {
        recurring_payments: [teamRow],
        team_members: [{ data: { role: "member" }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(403);
  });

  it("400s when period is missing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(supabaseAdmin).mockReturnValue(
      makeDb({ reads: { recurring_payments: [owner] } }) as never
    );
    const res = await PUT(put({ day: 20 }) as never, params);
    expect(res.status).toBe(400);
    expect(upsertDayChange).not.toHaveBeenCalled();
  });

  it("400s when day is outside 1..31", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(supabaseAdmin).mockReturnValue(
      makeDb({ reads: { recurring_payments: [owner] } }) as never
    );
    const res = await PUT(put({ period: "2025-05", day: 0 }) as never, params);
    expect(res.status).toBe(400);
  });

  it("persists and returns the merged day_changes on success", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({ reads: { recurring_payments: [owner, dayChangesRow] } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(await res.json()).toEqual({ day_changes: nextDayChanges });
    expect(db._updates).toEqual([
      { table: "recurring_payments", payload: { day_changes: nextDayChanges } },
    ]);
  });

  it("clears this month's date override (needsClear only) when the entry has a due_date", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({
      reads: {
        recurring_payments: [owner, dayChangesRow],
        recurring_entries: [{ data: { id: "e-1", due_date: "2025-05-20" }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(200);
    // The period is normalized to the first-of-month key and only due_date is cleared.
    expect(db._upserts).toEqual([
      {
        table: "recurring_entries",
        payload: { recurring_id: "r-1", period: "2025-05-01", due_date: null },
        opts: { onConflict: "recurring_id,period" },
      },
    ]);
  });

  it("writes amounts (hasAmounts only) without touching due_date when the entry has none", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(cleanCurrencyAmounts).mockReturnValue({ amounts: [{ currency: "USD", amount: 12 }] });
    const db = makeDb({
      reads: {
        recurring_payments: [owner, dayChangesRow],
        recurring_entries: [{ data: { id: "e-1", due_date: null }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(
      put({ period: "2025-05", day: 20, amounts: [{ currency: "USD", amount: 12 }] }) as never,
      params
    );
    expect(res.status).toBe(200);
    expect(db._upserts).toEqual([
      {
        table: "recurring_entries",
        payload: {
          recurring_id: "r-1",
          period: "2025-05-01",
          amounts: [{ currency: "USD", amount: 12 }],
          amount: null,
        },
        opts: { onConflict: "recurring_id,period" },
      },
    ]);
  });

  it("writes no entry (neither) when there is nothing to clear and no amounts", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({ reads: { recurring_payments: [owner, dayChangesRow] } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(200);
    // The day-change was still recorded, but no empty recurring_entries row was created.
    expect(db._updates).toHaveLength(1);
    expect(db._upserts).toHaveLength(0);
  });

  it("500s when the day_changes update fails", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({
      reads: { recurring_payments: [owner, dayChangesRow] },
      writes: { recurring_payments: [{ error: { message: "boom" } }] },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });

  it("404s when the day_changes read fails after the ownership check", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({
      reads: { recurring_payments: [owner, { data: null, error: { message: "no row" } }] },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ period: "2025-05", day: 20 }) as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no row" });
    // The 404 short-circuits before the day-change merge or any write.
    expect(upsertDayChange).not.toHaveBeenCalled();
    expect(db._updates).toHaveLength(0);
  });

  it("400s when cleanCurrencyAmounts rejects the amounts payload", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(cleanCurrencyAmounts).mockReturnValue({ error: "bad amounts" } as never);
    const db = makeDb({ reads: { recurring_payments: [owner, dayChangesRow] } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(
      put({ period: "2025-05", day: 20, amounts: [{ currency: "??", amount: 1 }] }) as never,
      params
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad amounts" });
    // Amounts are validated before any write, so nothing is persisted (atomic).
    expect(upsertDayChange).not.toHaveBeenCalled();
    expect(db._updates).toHaveLength(0);
    expect(db._upserts).toHaveLength(0);
  });

  it("500s when the recurring_entries upsert fails", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(cleanCurrencyAmounts).mockReturnValue({ amounts: [{ currency: "USD", amount: 12 }] });
    const db = makeDb({
      reads: { recurring_payments: [owner, dayChangesRow] },
      writes: { recurring_entries: [{ error: { message: "entry boom" } }] },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(
      put({ period: "2025-05", day: 20, amounts: [{ currency: "USD", amount: 12 }] }) as never,
      params
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "entry boom" });
  });
});
