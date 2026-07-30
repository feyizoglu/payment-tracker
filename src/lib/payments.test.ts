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
  effectiveDayForMonth,
  upsertDayChange,
  forwardInstallmentDueDates,
  isPureDayChange,
  decideEditSubmit,
} from "@/lib/payments";
import { Payment, RecurringPayment, Occurrence } from "@/types";

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

describe("effectiveDayForMonth", () => {
  it("returns the base day_of_month when there are no changes", () => {
    const r = makeRecurring({ day_of_month: 15, day_changes: null });
    expect(effectiveDayForMonth(r, 2026, 6)).toBe(15);
    expect(effectiveDayForMonth(makeRecurring({ day_of_month: 15 }), 2026, 6)).toBe(15);
  });

  it("applies a change from its `from` month onward, base day before it", () => {
    const r = makeRecurring({ day_of_month: 15, day_changes: [{ from: "2026-08-01", day: 3 }] });
    expect(effectiveDayForMonth(r, 2026, 6)).toBe(15); // July — before change
    expect(effectiveDayForMonth(r, 2026, 7)).toBe(3);  // August — change month
    expect(effectiveDayForMonth(r, 2026, 9)).toBe(3);  // October — after change
  });

  it("picks the latest applicable change when several exist (unsorted input)", () => {
    const r = makeRecurring({ day_of_month: 15, day_changes: [
      { from: "2026-10-01", day: 20 },
      { from: "2026-08-01", day: 3 },
    ] });
    expect(effectiveDayForMonth(r, 2026, 6)).toBe(15); // Jul — base
    expect(effectiveDayForMonth(r, 2026, 8)).toBe(3);  // Sep — first change
    expect(effectiveDayForMonth(r, 2026, 11)).toBe(20); // Dec — second change
  });

  it("drives recurringOccurrenceForMonth's dueDate day (clamped) going forward", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      day_changes: [{ from: "2026-08-01", day: 31 }] });
    expect(recurringOccurrenceForMonth(r, 2026, 6)!.dueDate.getDate()).toBe(15); // Jul, base
    expect(recurringOccurrenceForMonth(r, 2026, 8)!.dueDate.getDate()).toBe(30); // Sep, day 31 clamped to 30
  });

  it("a per-month due_date override still wins over the effective day", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      day_changes: [{ from: "2026-07-01", day: 5 }],
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: null, is_paid: false, paid_at: null, due_date: "2026-07-22", created_at: "" }] });
    const occ = recurringOccurrenceForMonth(r, 2026, 6); // July
    expect(occ!.dueDate.getDate()).toBe(22); // override, not the change's day 5
    expect(occ!.overridden).toBe(true);
  });
});

describe("upsertDayChange", () => {
  it("appends a new change and keeps the list sorted by `from`", () => {
    const next = upsertDayChange([{ from: "2026-10-01", day: 20 }], "2026-08-01", 3);
    expect(next).toEqual([{ from: "2026-08-01", day: 3 }, { from: "2026-10-01", day: 20 }]);
  });

  it("replaces the day when the same `from` already exists", () => {
    const next = upsertDayChange([{ from: "2026-08-01", day: 3 }], "2026-08-01", 9);
    expect(next).toEqual([{ from: "2026-08-01", day: 9 }]);
  });

  it("treats null/undefined existing as an empty list", () => {
    expect(upsertDayChange(null, "2026-08-01", 3)).toEqual([{ from: "2026-08-01", day: 3 }]);
    expect(upsertDayChange(undefined, "2026-08-01", 3)).toEqual([{ from: "2026-08-01", day: 3 }]);
  });
});

describe("forwardInstallmentDueDates", () => {
  it("emits due dates for the given index through the last installment", () => {
    const p = makePayment({ start_date: "2026-06-10", day_of_month: 10, total_installments: 4 });
    const rows = forwardInstallmentDueDates(p, 1, 20);
    // indices 1..3 -> Jul/Aug/Sep on day 20
    expect(rows).toEqual([
      { index: 1, due_date: "2026-07-20" },
      { index: 2, due_date: "2026-08-20" },
      { index: 3, due_date: "2026-09-20" },
    ]);
  });

  it("clamps the day to each month's length", () => {
    const p = makePayment({ start_date: "2026-01-10", day_of_month: 10, total_installments: 3 });
    // index 1 -> Feb 2026; day 31 clamps to 28
    const rows = forwardInstallmentDueDates(p, 1, 31);
    expect(rows[0]).toEqual({ index: 1, due_date: "2026-02-28" });
    expect(rows[1]).toEqual({ index: 2, due_date: "2026-03-31" });
  });

  it("returns an empty list when fromIndex is past the last installment", () => {
    const p = makePayment({ total_installments: 3 });
    expect(forwardInstallmentDueDates(p, 3, 10)).toEqual([]);
  });
});

function recurringOcc(over: Partial<Occurrence> = {}): Occurrence {
  return {
    kind: "recurring", sourceId: "r1", name: "X", currency: "TRY",
    user_id: "u1", team_id: null, dueDate: new Date(2026, 6, 15),
    amount: null, isPaid: false, period: "2026-07-01", ...over,
  };
}

function installmentOcc(over: Partial<Occurrence> = {}): Occurrence {
  return {
    kind: "installment", sourceId: "p1", name: "X", currency: "TRY",
    user_id: "u1", team_id: null, dueDate: new Date(2026, 6, 10),
    amount: 100, isPaid: false, installmentIndex: 2, totalInstallments: 12, ...over,
  };
}

describe("isPureDayChange", () => {
  it("is false when the date is unchanged", () => {
    expect(isPureDayChange("2026-07-15", "2026-07-15")).toBe(false);
  });
  it("is true for a different day in the same month", () => {
    expect(isPureDayChange("2026-07-20", "2026-07-15")).toBe(true);
  });
  it("is false when the month differs", () => {
    expect(isPureDayChange("2026-08-05", "2026-07-15")).toBe(false);
  });
  it("is false for an empty date", () => {
    expect(isPureDayChange("", "2026-07-15")).toBe(false);
  });
});

describe("decideEditSubmit", () => {
  const amounts = [{ currency: "TRY", amount: 500 }];

  it("recurring + scope one + same-month day change -> entry override", () => {
    const { url, body } = decideEditSubmit({
      occurrence: recurringOcc(), reset: false, scope: "one",
      date: "2026-07-20", initialDate: "2026-07-15", amounts,
    });
    expect(url).toBe("/api/recurring/r1/entry");
    expect(body).toEqual({ period: "2026-07-01", due_date: "2026-07-20", amounts });
  });

  it("recurring + scope forward + same-month day change -> day-forward with the day", () => {
    const { url, body } = decideEditSubmit({
      occurrence: recurringOcc(), reset: false, scope: "forward",
      date: "2026-07-20", initialDate: "2026-07-15", amounts,
    });
    expect(url).toBe("/api/recurring/r1/day-forward");
    expect(body).toEqual({ period: "2026-07-01", day: 20, amounts });
  });

  it("suppresses forward when the date moves to another month", () => {
    const { url, body } = decideEditSubmit({
      occurrence: recurringOcc(), reset: false, scope: "forward",
      date: "2026-08-03", initialDate: "2026-07-15", amounts,
    });
    expect(url).toBe("/api/recurring/r1/entry");
    expect(body).toEqual({ period: "2026-07-01", due_date: "2026-08-03", amounts });
  });

  it("installment + scope forward -> day-forward with from_installment_index + day", () => {
    const { url, body } = decideEditSubmit({
      occurrence: installmentOcc(), reset: false, scope: "forward",
      date: "2026-07-05", initialDate: "2026-07-10", amounts,
    });
    expect(url).toBe("/api/payments/p1/day-forward");
    expect(body).toEqual({ from_installment_index: 2, day: 5, amounts });
  });

  it("installment + scope one -> override with due_date", () => {
    const { url, body } = decideEditSubmit({
      occurrence: installmentOcc(), reset: false, scope: "one",
      date: "2026-07-05", initialDate: "2026-07-10", amounts,
    });
    expect(url).toBe("/api/payments/p1/override");
    expect(body).toEqual({ installment_index: 2, due_date: "2026-07-05", amounts });
  });

  it("reset suppresses forward and clears the recurring date override", () => {
    const { url, body } = decideEditSubmit({
      occurrence: recurringOcc(), reset: true, scope: "forward",
      date: "2026-07-20", initialDate: "2026-07-15", amounts,
    });
    expect(url).toBe("/api/recurring/r1/entry");
    expect(body).toEqual({ period: "2026-07-01", due_date: null });
  });

  it("reset on an installment removes the override (due_date + amount null)", () => {
    const { url, body } = decideEditSubmit({
      occurrence: installmentOcc(), reset: true, scope: "one",
      date: "2026-07-10", initialDate: "2026-07-10", amounts,
    });
    expect(url).toBe("/api/payments/p1/override");
    expect(body).toEqual({ installment_index: 2, due_date: null, amount: null });
  });

  it("an empty date is not a pure day change -> per-occurrence entry with null date", () => {
    const { url, body } = decideEditSubmit({
      occurrence: recurringOcc(), reset: false, scope: "forward",
      date: "", initialDate: "2026-07-15", amounts,
    });
    expect(url).toBe("/api/recurring/r1/entry");
    expect(body).toEqual({ period: "2026-07-01", due_date: null, amounts });
  });
});
