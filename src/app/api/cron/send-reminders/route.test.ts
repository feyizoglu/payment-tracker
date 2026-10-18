import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDays, format } from "date-fns";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendExpoPush: vi.fn() }));
vi.mock("@/lib/web-push", () => ({ sendWebPush: vi.fn() }));
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
import { sendWebPush } from "@/lib/web-push";
import { getInstallments } from "@/lib/payments";
import { GET } from "./route";

// Minimal stub of the Supabase fluent chain used by this route:
// - `.from(t).select(...)` is awaited directly (payments, recurring_payments) → { data, error }
// - `.from("devices").select(...).in(...)` is awaited → { data, error }
// - `.from(t).delete().in(col, vals)` records the deleted values (all tables in
//   `_deleted`, per table in `_deletedFrom`)
function makeDb(
  rowsByTable: Record<string, unknown[]>,
  errorsByTable: Record<string, { message: string }> = {},
  deleteError: { message: string } | null = null
) {
  const deleted: string[] = [];
  const deletedFrom: Record<string, string[]> = {};
  const selectedIn: Record<string, { col: string; vals: string[] }> = {};
  const db = {
    _deleted: deleted,
    _deletedFrom: deletedFrom,
    _selectedIn: selectedIn,
    from(table: string) {
      const result = {
        data: errorsByTable[table] ? null : rowsByTable[table] ?? [],
        error: errorsByTable[table] ?? null,
      };
      const selectObj = {
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
        in: (col: string, vals: string[]) => {
          selectedIn[table] = { col, vals };
          return Promise.resolve(result);
        },
      };
      return {
        select: () => selectObj,
        delete: () => ({
          in: (_col: string, vals: string[]) => {
            deleted.push(...vals);
            (deletedFrom[table] ??= []).push(...vals);
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendWebPush).mockResolvedValue({ sent: 0, expiredEndpoints: [], errors: [] });
});

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

describe("GET /api/cron/send-reminders web push", () => {
  const duePayment = {
    id: "p-1",
    user_id: "u-1",
    name: "Kredi Kartı",
    currency: "TRY",
    paid_installments: 0,
    total_installments: 3,
    user: { id: "u-1", name: "Test", email: "t@example.com" },
  };

  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    vi.mocked(getInstallments).mockReturnValue([
      { index: 0, dueDate: addDays(new Date(), 1), amount: 100, isPaid: false } as never,
    ]);
    vi.mocked(sendExpoPush).mockResolvedValue({ sent: 0, invalidTokens: [], errors: [] });
  });

  it("sends only to due users' subscriptions with a dashboard link for tomorrow's month", async () => {
    const db = makeDb({
      payments: [duePayment],
      recurring_payments: [],
      devices: [],
      web_push_subscriptions: [
        { user_id: "u-1", endpoint: "https://push.example/u1", p256dh: "p1", auth: "a1" },
        { user_id: "u-2", endpoint: "https://push.example/u2", p256dh: "p2", auth: "a2" },
      ],
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendWebPush).mockResolvedValue({ sent: 1, expiredEndpoints: [], errors: [] });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(db._selectedIn.web_push_subscriptions).toEqual({ col: "user_id", vals: ["u-1"] });
    expect(sendWebPush).toHaveBeenCalledTimes(1);
    const month = format(addDays(new Date(), 1), "yyyy-MM");
    expect(sendWebPush).toHaveBeenCalledWith(
      [{ endpoint: "https://push.example/u1", p256dh: "p1", auth: "a1" }],
      {
        title: "Ödeme Hatırlatıcısı",
        body: expect.stringContaining("Kredi Kartı — ₺100,00"),
        url: `/dashboard?month=${month}`,
      }
    );
    expect(json.webPush).toEqual({ sent: 1, expiredEndpoints: [], errors: [] });
    expect(json.push).toBeDefined();
    expect(db._deletedFrom.web_push_subscriptions).toBeUndefined();
  });

  it("deletes the endpoints the push service reports expired", async () => {
    const db = makeDb({
      payments: [duePayment],
      recurring_payments: [],
      devices: [],
      web_push_subscriptions: [
        { user_id: "u-1", endpoint: "https://push.example/gone", p256dh: "p1", auth: "a1" },
      ],
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendWebPush).mockResolvedValue({
      sent: 0,
      expiredEndpoints: ["https://push.example/gone"],
      errors: [],
    });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(db._deletedFrom.web_push_subscriptions).toEqual(["https://push.example/gone"]);
    expect(json.webPush.expiredEndpoints).toEqual(["https://push.example/gone"]);
  });

  it("surfaces a subscriptions-query failure in webPush.errors", async () => {
    const db = makeDb(
      { payments: [duePayment], recurring_payments: [], devices: [] },
      { web_push_subscriptions: { message: "boom" } }
    );
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(sendWebPush).not.toHaveBeenCalled();
    expect(json.webPush.errors).toContain("web push subscriptions query failed: boom");
  });

  it("does not query or send when nobody is due tomorrow", async () => {
    vi.mocked(getInstallments).mockReturnValue([]);
    const db = makeDb({
      payments: [duePayment],
      recurring_payments: [],
      web_push_subscriptions: [
        { user_id: "u-1", endpoint: "https://push.example/u1", p256dh: "p1", auth: "a1" },
      ],
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(db._selectedIn.web_push_subscriptions).toBeUndefined();
    expect(sendWebPush).not.toHaveBeenCalled();
    expect(json.webPush).toEqual({ sent: 0, expiredEndpoints: [], errors: [] });
  });
});

describe("GET /api/cron/send-reminders web push aggregation", () => {
  const payment = (id: string, userId: string, name: string) => ({
    id,
    user_id: userId,
    name,
    currency: "TRY",
    paid_installments: 0,
    total_installments: 3,
    user: { id: userId, name, email: `${userId}@example.com` },
  });

  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    vi.mocked(getInstallments).mockReturnValue([
      { index: 0, dueDate: addDays(new Date(), 1), amount: 100, isPaid: false } as never,
    ]);
    vi.mocked(sendExpoPush).mockResolvedValue({ sent: 0, invalidTokens: [], errors: [] });
  });

  it("surfaces a failed expired-endpoint prune in webPush.errors", async () => {
    const db = makeDb(
      {
        payments: [payment("p-1", "u-1", "Kredi Kartı")],
        recurring_payments: [],
        devices: [],
        web_push_subscriptions: [
          { user_id: "u-1", endpoint: "https://push.example/gone", p256dh: "p1", auth: "a1" },
        ],
      },
      {},
      { message: "delete failed" }
    );
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendWebPush).mockResolvedValue({
      sent: 0,
      expiredEndpoints: ["https://push.example/gone"],
      errors: [],
    });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(json.webPush.errors).toContain("expired web push prune failed: delete failed");
  });

  it("sends once per due user with that user's subscriptions and sums the results", async () => {
    const db = makeDb({
      payments: [payment("p-1", "u-1", "Kira"), payment("p-2", "u-2", "Aidat")],
      recurring_payments: [],
      devices: [],
      web_push_subscriptions: [
        { user_id: "u-1", endpoint: "https://push.example/u1", p256dh: "p1", auth: "a1" },
        { user_id: "u-2", endpoint: "https://push.example/u2", p256dh: "p2", auth: "a2" },
      ],
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendWebPush)
      .mockResolvedValueOnce({ sent: 1, expiredEndpoints: ["https://push.example/x1"], errors: [] })
      .mockResolvedValueOnce({ sent: 2, expiredEndpoints: ["https://push.example/x2"], errors: [] });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(sendWebPush).toHaveBeenNthCalledWith(
      1,
      [{ endpoint: "https://push.example/u1", p256dh: "p1", auth: "a1" }],
      expect.objectContaining({ body: expect.stringContaining("Kira") })
    );
    expect(sendWebPush).toHaveBeenNthCalledWith(
      2,
      [{ endpoint: "https://push.example/u2", p256dh: "p2", auth: "a2" }],
      expect.objectContaining({ body: expect.stringContaining("Aidat") })
    );
    expect(vi.mocked(sendWebPush).mock.calls[0][1].body).not.toContain("Aidat");
    expect(vi.mocked(sendWebPush).mock.calls[1][1].body).not.toContain("Kira");
    expect(json.webPush.sent).toBe(3);
    expect(json.webPush.expiredEndpoints).toEqual(["https://push.example/x1", "https://push.example/x2"]);
  });

  it("reports an error shared by several users only once", async () => {
    const db = makeDb({
      payments: [payment("p-1", "u-1", "Kira"), payment("p-2", "u-2", "Aidat")],
      recurring_payments: [],
      devices: [],
      web_push_subscriptions: [
        { user_id: "u-1", endpoint: "https://push.example/u1", p256dh: "p1", auth: "a1" },
        { user_id: "u-2", endpoint: "https://push.example/u2", p256dh: "p2", auth: "a2" },
      ],
    });
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    vi.mocked(sendWebPush).mockResolvedValue({
      sent: 0,
      expiredEndpoints: [],
      errors: ["VAPID env not configured"],
    });

    const res = await GET(req("Bearer s3cret") as never);
    const json = await res.json();

    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(json.webPush.errors).toEqual(["VAPID env not configured"]);
  });
});
