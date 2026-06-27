import { describe, it, expect } from "vitest";
import {
  recurringOccurrenceForMonth,
  getOccurrencesForMonth,
  getOccurrencesInRange,
  getInstallments,
  getRemainingAmount,
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
