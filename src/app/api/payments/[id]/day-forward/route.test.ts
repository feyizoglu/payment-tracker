import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
// supabaseAdmin must never be constructed on the 401 path below.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));
// The installment math is unit-tested in payments.test.ts; mock it so the branches
// this handler orchestrates (no rows / rows / amounts) are deterministic here.
vi.mock("@/lib/payments", () => ({
  cleanCurrencyAmounts: vi.fn(),
  forwardInstallmentDueDates: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { cleanCurrencyAmounts, forwardInstallmentDueDates } from "@/lib/payments";
import { PUT } from "./route";

// Minimal stub of the Supabase fluent chain this route uses:
// - reads: `.from(t).select(...).eq(...).single()` → shifts the next queued result
//   for table `t` ("payments" is read twice: ownership check, then start/total).
// - writes: `.from("payment_overrides").upsert(payload, opts)` is awaited → { error }
//   and every upsert is recorded so payloads can be asserted.
function makeDb(opts: {
  reads?: Record<string, Array<{ data?: unknown; error?: unknown }>>;
  writes?: Record<string, Array<{ error?: unknown }>>;
} = {}) {
  const reads = opts.reads ?? {};
  const writes = opts.writes ?? {};
  const upserts: Array<{ table: string; payload: unknown; opts: unknown }> = [];
  const db = {
    _upserts: upserts,
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: () =>
          Promise.resolve((reads[table] ?? []).shift() ?? { data: null, error: null }),
        upsert: (payload: unknown, o: unknown) => {
          upserts.push({ table, payload, opts: o });
          return Promise.resolve((writes[table] ?? []).shift() ?? { error: null });
        },
      };
      return builder;
    },
  };
  return db;
}

const put = (body: unknown) =>
  new Request("http://localhost/api/payments/p-1/day-forward", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const params = { params: Promise.resolve({ id: "p-1" }) };
const owner = { data: { user_id: "u-1", team_id: null }, error: null };
const paymentRow = { data: { start_date: "2025-01-15", total_installments: 12 }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: `amounts` field absent → clean result carries no amounts.
  vi.mocked(cleanCurrencyAmounts).mockReturnValue({ amounts: null });
});

describe("PUT /api/payments/[id]/day-forward", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await PUT(put({ from_installment_index: 2, day: 10 }) as never, params);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("403s when the caller neither owns the payment nor owns its team", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(supabaseAdmin).mockReturnValue(
      makeDb({
        reads: { payments: [{ data: { user_id: "someone-else", team_id: null }, error: null }] },
      }) as never
    );
    const res = await PUT(put({ from_installment_index: 2, day: 10 }) as never, params);
    expect(res.status).toBe(403);
  });

  it("allows a team owner who does not personally own the payment", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const teamRow = { data: { user_id: "someone-else", team_id: "t-1" }, error: null };
    const db = makeDb({
      reads: {
        payments: [teamRow, paymentRow],
        team_members: [{ data: { role: "owner" }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(forwardInstallmentDueDates).mockReturnValue([{ index: 2, due_date: "2025-03-10" }]);
    const res = await PUT(put({ from_installment_index: 2, day: 10 }) as never, params);
    expect(res.status).toBe(200);
    expect(db._upserts).toHaveLength(1);
  });

  it("403s a team member who is not the team owner", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const teamRow = { data: { user_id: "someone-else", team_id: "t-1" }, error: null };
    const db = makeDb({
      reads: {
        payments: [teamRow],
        team_members: [{ data: { role: "member" }, error: null }],
      },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ from_installment_index: 2, day: 10 }) as never, params);
    expect(res.status).toBe(403);
  });

  it("400s when from_installment_index is not a non-negative integer", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(supabaseAdmin).mockReturnValue(makeDb({ reads: { payments: [owner] } }) as never);
    const res = await PUT(put({ from_installment_index: -1, day: 10 }) as never, params);
    expect(res.status).toBe(400);
    // Validation short-circuits before any installment math runs.
    expect(forwardInstallmentDueDates).not.toHaveBeenCalled();
  });

  it("400s when day is outside 1..31", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    vi.mocked(supabaseAdmin).mockReturnValue(makeDb({ reads: { payments: [owner] } }) as never);
    const res = await PUT(put({ from_installment_index: 2, day: 40 }) as never, params);
    expect(res.status).toBe(400);
  });

  it("returns updated:0 without upserting when no installments remain", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({ reads: { payments: [owner, paymentRow] } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(forwardInstallmentDueDates).mockReturnValue([]);
    const res = await PUT(put({ from_installment_index: 20, day: 10 }) as never, params);
    expect(await res.json()).toEqual({ updated: 0 });
    expect(db._upserts).toHaveLength(0);
  });

  it("upserts one due_date row per remaining installment on the happy path", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({ reads: { payments: [owner, paymentRow] } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(forwardInstallmentDueDates).mockReturnValue([
      { index: 2, due_date: "2025-03-10" },
      { index: 3, due_date: "2025-04-10" },
    ]);
    const res = await PUT(put({ from_installment_index: 2, day: 10 }) as never, params);
    expect(await res.json()).toEqual({ updated: 2 });
    // Only the due-date upsert runs (no amounts override), carrying both rows.
    expect(db._upserts).toHaveLength(1);
    expect(db._upserts[0].table).toBe("payment_overrides");
    expect(db._upserts[0].payload).toEqual([
      { payment_id: "p-1", installment_index: 2, due_date: "2025-03-10" },
      { payment_id: "p-1", installment_index: 3, due_date: "2025-04-10" },
    ]);
  });

  it("writes a second amount override at the starting index when amounts are provided", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({ reads: { payments: [owner, paymentRow] } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(forwardInstallmentDueDates).mockReturnValue([{ index: 2, due_date: "2025-03-10" }]);
    vi.mocked(cleanCurrencyAmounts).mockReturnValue({ amounts: [{ currency: "TRY", amount: 500 }] });
    const res = await PUT(
      put({ from_installment_index: 2, day: 10, amounts: [{ currency: "TRY", amount: 500 }] }) as never,
      params
    );
    expect(res.status).toBe(200);
    expect(db._upserts).toHaveLength(2);
    expect(db._upserts[1].payload).toEqual({
      payment_id: "p-1",
      installment_index: 2,
      amounts: [{ currency: "TRY", amount: 500 }],
      amount: null,
    });
  });

  it("500s when the due_date upsert fails", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({
      reads: { payments: [owner, paymentRow] },
      writes: { payment_overrides: [{ error: { message: "db down" } }] },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(forwardInstallmentDueDates).mockReturnValue([{ index: 2, due_date: "2025-03-10" }]);
    const res = await PUT(put({ from_installment_index: 2, day: 10 }) as never, params);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db down" });
  });

  it("404s when the payment read fails after the ownership check", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({
      reads: { payments: [owner, { data: null, error: { message: "gone" } }] },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await PUT(put({ from_installment_index: 2, day: 10 }) as never, params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "gone" });
    // The 404 short-circuits before any installment math or upsert.
    expect(forwardInstallmentDueDates).not.toHaveBeenCalled();
    expect(db._upserts).toHaveLength(0);
  });

  it("400s when cleanCurrencyAmounts rejects the amounts payload", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({ reads: { payments: [owner, paymentRow] } });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(forwardInstallmentDueDates).mockReturnValue([{ index: 2, due_date: "2025-03-10" }]);
    vi.mocked(cleanCurrencyAmounts).mockReturnValue({ error: "bad amounts" } as never);
    const res = await PUT(
      put({ from_installment_index: 2, day: 10, amounts: [{ currency: "??", amount: 1 }] }) as never,
      params
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad amounts" });
    // The due-date upsert already ran; the amount override upsert never does.
    expect(db._upserts).toHaveLength(1);
  });

  it("500s when the amount override upsert fails", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const db = makeDb({
      reads: { payments: [owner, paymentRow] },
      writes: { payment_overrides: [{ error: null }, { error: { message: "amt fail" } }] },
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(forwardInstallmentDueDates).mockReturnValue([{ index: 2, due_date: "2025-03-10" }]);
    vi.mocked(cleanCurrencyAmounts).mockReturnValue({ amounts: [{ currency: "TRY", amount: 500 }] });
    const res = await PUT(
      put({ from_installment_index: 2, day: 10, amounts: [{ currency: "TRY", amount: 500 }] }) as never,
      params
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "amt fail" });
  });
});
