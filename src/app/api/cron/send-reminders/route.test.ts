import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDays } from "date-fns";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendExpoPush: vi.fn() }));
// Mock the installment math (already unit-tested in payments.test.ts) so we can
// deterministically place a payment "due tomorrow" without reconstructing dates.
vi.mock("@/lib/payments", () => ({
  getInstallments: vi.fn(),
  recurringOccurrencesInRange: vi.fn(() => []),
  getCurrencySymbol: vi.fn(() => "₺"),
}));
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: vi.fn().mockResolvedValue({ error: null }) } })),
}));

import { supabaseAdmin } from "@/lib/supabase";
import { sendExpoPush } from "@/lib/push";
import { getInstallments } from "@/lib/payments";
import { GET } from "./route";

// Minimal stub of the Supabase fluent chain used by this route:
// - `.from(t).select(...)` is awaited directly (payments, recurring_payments) → { data, error }
// - `.from("devices").select(...).in(...)` is awaited → { data, error }
// - `.from("devices").delete().in(col, vals)` records the deleted tokens
function makeDb(
  rowsByTable: Record<string, unknown[]>,
  errorsByTable: Record<string, { message: string }> = {},
  deleteError: { message: string } | null = null
) {
  const deleted: string[] = [];
  const db = {
    _deleted: deleted,
    from(table: string) {
      const result = {
        data: errorsByTable[table] ? null : rowsByTable[table] ?? [],
        error: errorsByTable[table] ?? null,
      };
      const selectObj = {
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
        in: () => Promise.resolve(result),
      };
      return {
        select: () => selectObj,
        delete: () => ({
          in: (_col: string, vals: string[]) => {
            deleted.push(...vals);
            return Promise.resolve({ error: deleteError });
          },
        }),
      };
    },
  };
  return db;
}

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/send-reminders", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/cron/send-reminders", () => {
  it("401s without the CRON_SECRET bearer token", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("Bearer wrong") as never);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("pushes to due users' devices and prunes tokens Expo reports invalid", async () => {
    process.env.CRON_SECRET = "s3cret";

    // A payment for user u-1 whose single installment falls tomorrow.
    const tomorrow = addDays(new Date(), 1);
    vi.mocked(getInstallments).mockReturnValue([
      { index: 0, dueDate: tomorrow, amount: 100, isPaid: false } as never,
    ]);

    const db = makeDb({
      payments: [
        {
          id: "p-1",
          user_id: "u-1",
          name: "Kredi Kartı",
          currency: "TRY",
          paid_installments: 0,
          total_installments: 3,
          user: { id: "u-1", name: "Test", email: "t@example.com" },
        },
      ],
      recurring_payments: [],
      devices: [{ user_id: "u-1", expo_push_token: "ExponentPushToken[dead]" }],
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendExpoPush).mockResolvedValue({
      sent: 0,
      invalidTokens: ["ExponentPushToken[dead]"],
      errors: [],
    });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    // The push message body is assembled from the due item (name + formatted amount),
    // not just a static title.
    expect(sendExpoPush).toHaveBeenCalledWith([
      expect.objectContaining({
        to: "ExponentPushToken[dead]",
        title: "Ödeme Hatırlatıcısı",
        body: expect.stringContaining("Kredi Kartı — ₺100,00"),
        data: { month: expect.stringMatching(/^\d{4}-\d{2}$/) },
      }),
    ]);
    // The dead token was pruned from the devices table.
    expect(db._deleted).toEqual(["ExponentPushToken[dead]"]);
    // And the response surfaces the push summary.
    expect(json.push.invalidTokens).toContain("ExponentPushToken[dead]");
  });

  it("surfaces a devices-query failure in push.errors instead of swallowing it", async () => {
    process.env.CRON_SECRET = "s3cret";

    const tomorrow = addDays(new Date(), 1);
    vi.mocked(getInstallments).mockReturnValue([
      { index: 0, dueDate: tomorrow, amount: 100, isPaid: false } as never,
    ]);

    const db = makeDb(
      {
        payments: [
          {
            id: "p-1",
            user_id: "u-1",
            name: "Kredi Kartı",
            currency: "TRY",
            paid_installments: 0,
            total_installments: 3,
            user: { id: "u-1", name: "Test", email: "t@example.com" },
          },
        ],
        recurring_payments: [],
      },
      { devices: { message: "boom" } }
    );
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendExpoPush).mockResolvedValue({ sent: 0, invalidTokens: [], errors: [] });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    // The error must survive into the response (regression guard: pushSummary
    // is merged, not overwritten, by the sendExpoPush result).
    expect(json.push.errors).toContain("devices query failed: boom");
  });

  it("surfaces a failed dead-token prune in push.errors", async () => {
    process.env.CRON_SECRET = "s3cret";

    const tomorrow = addDays(new Date(), 1);
    vi.mocked(getInstallments).mockReturnValue([
      { index: 0, dueDate: tomorrow, amount: 100, isPaid: false } as never,
    ]);

    const db = makeDb(
      {
        payments: [
          {
            id: "p-1",
            user_id: "u-1",
            name: "Kredi Kartı",
            currency: "TRY",
            paid_installments: 0,
            total_installments: 3,
            user: { id: "u-1", name: "Test", email: "t@example.com" },
          },
        ],
        recurring_payments: [],
        devices: [{ user_id: "u-1", expo_push_token: "ExponentPushToken[dead]" }],
      },
      {},
      { message: "delete failed" }
    );
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendExpoPush).mockResolvedValue({
      sent: 0,
      invalidTokens: ["ExponentPushToken[dead]"],
      errors: [],
    });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(json.push.errors).toContain("dead-token prune failed: delete failed");
  });
});
