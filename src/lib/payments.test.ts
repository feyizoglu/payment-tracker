import { describe, it, expect } from "vitest";
import {
  recurringOccurrenceForMonth,
  getOccurrencesForMonth,
  getOccurrencesInRange,
  getInstallments,
  getRemainingAmount,
  recurringOccurrencesInRange,
  installmentOccurrences,
  cleanCurrencyAmounts,
} from "@/lib/payments";
import { Payment, RecurringPayment } from "@/types";

function makeRecurring(over: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    id: "r1",
    team_id: null,
    user_id: "u1",
    name: "Kredi Kartı",
    currency: "TRY",
    day_of_month: 15,
    start_month: "2026-06-01",
    end_month: null,
    created_at: "2026-06-01T00:00:00Z",
    entries: [],
    ...over,
  };
}

function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    team_id: null,
    user_id: "u1",
    name: "Laptop",
    amount: 1200,
    currency: "TRY",
    start_date: "2026-06-10",
    day_of_month: 10,
    total_installments: 12,
    paid_installments: 0,
    created_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("recurringOccurrenceForMonth", () => {
  it("returns null before the start month", () => {
    const r = makeRecurring({ start_month: "2026-06-01" });
    expect(recurringOccurrenceForMonth(r, 2026, 4)).toBeNull(); // May
  });

  it("returns an occurrence within the active range", () => {
    const r = makeRecurring();
    const occ = recurringOccurrenceForMonth(r, 2026, 6); // July (0-indexed 6)
    expect(occ).not.toBeNull();
    expect(occ!.kind).toBe("recurring");
    expect(occ!.dueDate.getFullYear()).toBe(2026);
    expect(occ!.dueDate.getMonth()).toBe(6);
    expect(occ!.dueDate.getDate()).toBe(15);
    expect(occ!.amount).toBeNull();
    expect(occ!.isPaid).toBe(false);
  });

  it("clamps day_of_month to the last day of short months", () => {
    const r = makeRecurring({ day_of_month: 31, start_month: "2026-01-01" });
    const occ = recurringOccurrenceForMonth(r, 2026, 1); // Feb 2026 -> 28
    expect(occ!.dueDate.getDate()).toBe(28);
  });

  it("includes the end month (inclusive) but not after", () => {
    const r = makeRecurring({ start_month: "2026-06-01", end_month: "2026-08-01" });
    expect(recurringOccurrenceForMonth(r, 2026, 7)).not.toBeNull(); // Aug
    expect(recurringOccurrenceForMonth(r, 2026, 8)).toBeNull();     // Sep
  });

  it("reads amount and isPaid from the matching entry", () => {
    const r = makeRecurring({
      entries: [
        { id: "e1", recurring_id: "r1", period: "2026-07-01", amount: 5000, is_paid: true, paid_at: null, due_date: null, created_at: "" },
      ],
    });
    const occ = recurringOccurrenceForMonth(r, 2026, 6); // July
    expect(occ!.amount).toBe(5000);
    expect(occ!.isPaid).toBe(true);
    expect(occ!.entryId).toBe("e1");
    expect(occ!.period).toBe("2026-07-01");
  });
});

describe("getOccurrencesForMonth", () => {
  it("merges installment and recurring occurrences sorted by day", () => {
    const payment = makePayment({ start_date: "2026-07-20", day_of_month: 20 });
    const r = makeRecurring({ day_of_month: 5, start_month: "2026-06-01" });
    const occ = getOccurrencesForMonth([payment], [r], 2026, 6); // July
    expect(occ.map((o) => o.dueDate.getDate())).toEqual([5, 20]);
    expect(occ[0].kind).toBe("recurring");
    expect(occ[1].kind).toBe("installment");
  });
});

describe("getOccurrencesInRange", () => {
  it("includes recurring occurrences whose due date falls in range", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01" });
    const start = new Date(2026, 6, 1);  // 1 Jul
    const end = new Date(2026, 7, 31);   // 31 Aug
    const occ = getOccurrencesInRange([], [r], start, end);
    expect(occ.length).toBe(2); // Jul 15 + Aug 15
    expect(occ[0].dueDate.getMonth()).toBe(6);
    expect(occ[1].dueDate.getMonth()).toBe(7);
  });

  it("excludes occurrences outside the range boundaries", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01" });
    const start = new Date(2026, 6, 16); // 16 Jul (after the 15th)
    const end = new Date(2026, 6, 31);   // 31 Jul
    const occ = getOccurrencesInRange([], [r], start, end);
    expect(occ.length).toBe(0);
  });
});

describe("getInstallments with overrides", () => {
  it("overrides only the targeted installment's amount", () => {
    const p = makePayment({ amount: 1200, total_installments: 12, start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 2, due_date: null, amount: 250, created_at: "" }] });
    const inst = getInstallments(p);
    expect(inst[2].amount).toBe(250);
    expect(inst[2].overridden).toBe(true);
    expect(inst[0].amount).toBe(100);
    expect(inst[0].overridden).toBe(false);
  });

  it("overrides an installment's due date (used as-is, no clamp)", () => {
    const p = makePayment({ amount: 300, total_installments: 3, start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 1, due_date: "2026-09-05", amount: null, created_at: "" }] });
    const inst = getInstallments(p);
    expect(inst[1].dueDate.getFullYear()).toBe(2026);
    expect(inst[1].dueDate.getMonth()).toBe(8); // September
    expect(inst[1].dueDate.getDate()).toBe(5);
    expect(inst[1].overridden).toBe(true);
  });

  it("a date-overridden installment moves to the new month in getOccurrencesForMonth", () => {
    const p = makePayment({ amount: 300, total_installments: 3, start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 1, due_date: "2026-09-05", amount: null, created_at: "" }] });
    expect(getOccurrencesForMonth([p], [], 2026, 6).some((o) => o.installmentIndex === 1)).toBe(false);
    const sep = getOccurrencesForMonth([p], [], 2026, 8);
    expect(sep.some((o) => o.installmentIndex === 1 && o.overridden)).toBe(true);
  });

  it("getRemainingAmount sums effective amounts of unpaid installments", () => {
    const p = makePayment({ amount: 1200, total_installments: 12, paid_installments: 0,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 0, due_date: null, amount: 300, created_at: "" }] });
    expect(getRemainingAmount(p)).toBe(300 + 100 * 11); // 1400
  });
});

describe("cleanCurrencyAmounts", () => {
  it("returns amounts: null for non-array input (field absent)", () => {
    expect(cleanCurrencyAmounts(undefined)).toEqual({ amounts: null });
    expect(cleanCurrencyAmounts(null)).toEqual({ amounts: null });
    expect(cleanCurrencyAmounts("nope")).toEqual({ amounts: null });
  });

  it("cleans valid lines and preserves order", () => {
    expect(
      cleanCurrencyAmounts([{ currency: "USD", amount: 100 }, { currency: "TRY", amount: 2000 }])
    ).toEqual({ amounts: [{ currency: "USD", amount: 100 }, { currency: "TRY", amount: 2000 }] });
  });

  it("coerces string amounts to numbers", () => {
    expect(cleanCurrencyAmounts([{ currency: "EUR", amount: "50.5" }])).toEqual({
      amounts: [{ currency: "EUR", amount: 50.5 }],
    });
  });

  it("skips blank-amount rows and non-object entries", () => {
    expect(
      cleanCurrencyAmounts([
        { currency: "USD", amount: "" },
        null,
        "garbage",
        { currency: "TRY", amount: 10 },
      ])
    ).toEqual({ amounts: [{ currency: "TRY", amount: 10 }] });
  });

  it("yields amounts: null when an array cleans down to nothing", () => {
    expect(cleanCurrencyAmounts([])).toEqual({ amounts: null });
    expect(cleanCurrencyAmounts([{ currency: "USD", amount: "" }])).toEqual({ amounts: null });
  });

  it("rejects a currency outside the allowlist", () => {
    expect(cleanCurrencyAmounts([{ currency: "JPY", amount: 100 }])).toEqual({
      error: "Invalid currency: JPY",
    });
    expect(cleanCurrencyAmounts([{ amount: 100 }])).toEqual({ error: "Invalid currency: " });
  });

  it("rejects non-positive or non-finite amounts", () => {
    expect(cleanCurrencyAmounts([{ currency: "USD", amount: 0 }])).toHaveProperty("error");
    expect(cleanCurrencyAmounts([{ currency: "USD", amount: -5 }])).toHaveProperty("error");
    expect(cleanCurrencyAmounts([{ currency: "USD", amount: "abc" }])).toHaveProperty("error");
  });
});

describe("multi-currency installment overrides", () => {
  it("getInstallments exposes override amounts lines and flags overridden", () => {
    const p = makePayment({ amount: 1200, total_installments: 12, currency: "TRY",
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 1, due_date: null, amount: null,
        amounts: [{ currency: "USD", amount: 100 }, { currency: "TRY", amount: 2000 }], created_at: "" }] });
    const inst = getInstallments(p);
    expect(inst[1].amounts).toEqual([{ currency: "USD", amount: 100 }, { currency: "TRY", amount: 2000 }]);
    expect(inst[1].overridden).toBe(true);
    // unaffected installment keeps default single amount, no amounts
    expect(inst[0].amount).toBe(100);
    expect(inst[0].amounts).toBeUndefined();
  });

  it("installmentOccurrences emits one occurrence per currency line", () => {
    const p = makePayment({ amount: 1200, total_installments: 12, currency: "TRY", start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 1, due_date: null, amount: null,
        amounts: [{ currency: "USD", amount: 100 }, { currency: "TRY", amount: 2000 }], created_at: "" }] });
    const occ = installmentOccurrences(p).filter((o) => o.installmentIndex === 1);
    expect(occ.length).toBe(2);
    expect(occ.map((o) => o.currency).sort()).toEqual(["TRY", "USD"]);
    const usd = occ.find((o) => o.currency === "USD")!;
    expect(usd.amount).toBe(100);
    expect(usd.overridden).toBe(true);
    // both lines fall on the same (default) due date
    expect(occ[0].dueDate.getTime()).toBe(occ[1].dueDate.getTime());
  });

  it("a single-currency (non-multi) installment still emits exactly one occurrence", () => {
    const p = makePayment({ total_installments: 3 });
    expect(installmentOccurrences(p).length).toBe(3);
  });

  it("multi-currency lines surface per-currency in getOccurrencesForMonth on the same day", () => {
    const p = makePayment({ amount: 1200, total_installments: 12, currency: "TRY", start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 0, due_date: null, amount: null,
        amounts: [{ currency: "USD", amount: 100 }, { currency: "TRY", amount: 2000 }], created_at: "" }] });
    const june = getOccurrencesForMonth([p], [], 2026, 5).filter((o) => o.installmentIndex === 0);
    expect(june.length).toBe(2);
    expect(june.every((o) => o.dueDate.getDate() === 10)).toBe(true);
  });
});

describe("recurring date override", () => {
  it("uses entry.due_date as the occurrence date and flags overridden", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: null, is_paid: false, paid_at: null, due_date: "2026-07-22", created_at: "" }] });
    const occ = recurringOccurrenceForMonth(r, 2026, 6); // July
    expect(occ!.dueDate.getDate()).toBe(22);
    expect(occ!.overridden).toBe(true);
  });

  it("falls back to the default clamped day when no due_date", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01" });
    const occ = recurringOccurrenceForMonth(r, 2026, 6);
    expect(occ!.dueDate.getDate()).toBe(15);
    expect(!!occ!.overridden).toBe(false);
  });

  it("moves an occurrence to another month (period stays fixed)", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: 500, is_paid: false, paid_at: null, due_date: "2026-08-03", created_at: "" }] });
    // July no longer shows it (moved out)
    const july = getOccurrencesForMonth([], [r], 2026, 6);
    expect(july.some((o) => o.period === "2026-07-01")).toBe(false);
    // August shows it, but its period stays July
    const aug = getOccurrencesForMonth([], [r], 2026, 7);
    const moved = aug.find((o) => o.period === "2026-07-01");
    expect(moved).toBeTruthy();
    expect(moved!.dueDate.getDate()).toBe(3);
    expect(moved!.overridden).toBe(true);
    // And August's own default occurrence is also present (period Aug)
    expect(aug.some((o) => o.period === "2026-08-01")).toBe(true);
  });

  it("emits one occurrence per currency line for a multi-currency entry", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: null,
        amounts: [{ currency: "USD", amount: 50 }, { currency: "TRY", amount: 900 }],
        is_paid: false, paid_at: null, due_date: null, created_at: "" }] });
    const july = getOccurrencesForMonth([], [r], 2026, 6).filter((o) => o.period === "2026-07-01");
    expect(july.length).toBe(2);
    expect(july.map((o) => o.currency).sort()).toEqual(["TRY", "USD"]);
    const usd = july.find((o) => o.currency === "USD")!;
    expect(usd.amount).toBe(50);
    expect(july.every((o) => o.dueDate.getDate() === 15)).toBe(true);
  });

  it("multi-currency lines still respect a due_date override (moved month, both lines)", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: null,
        amounts: [{ currency: "USD", amount: 50 }, { currency: "TRY", amount: 900 }],
        is_paid: false, paid_at: null, due_date: "2026-08-03", created_at: "" }] });
    expect(getOccurrencesForMonth([], [r], 2026, 6).some((o) => o.period === "2026-07-01")).toBe(false);
    const aug = getOccurrencesForMonth([], [r], 2026, 7).filter((o) => o.period === "2026-07-01");
    expect(aug.length).toBe(2);
    expect(aug.every((o) => o.dueDate.getDate() === 3 && o.overridden)).toBe(true);
  });

  it("recurringOccurrencesInRange includes override + default occurrences in range", () => {
    const r = makeRecurring({ day_of_month: 10, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: null, is_paid: false, paid_at: null, due_date: "2026-07-25", created_at: "" }] });
    const start = new Date(2026, 6, 1);   // 1 Jul
    const end = new Date(2026, 6, 31, 23, 59, 59, 999); // 31 Jul
    const occ = recurringOccurrencesInRange(r, start, end);
    expect(occ.length).toBe(1);
    expect(occ[0].dueDate.getDate()).toBe(25); // overridden, not default 10
  });
});
