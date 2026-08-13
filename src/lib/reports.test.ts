import { describe, it, expect } from "vitest";
import type { Occurrence, Payment, RecurringPayment } from "@/types";
import {
  sumByCurrency,
  formatCurrencyTotals,
  rangeReport,
  payUntilReport,
  startOfDay,
  endOfDay,
} from "@/lib/reports";

function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    team_id: null,
    user_id: "u1",
    name: "Laptop",
    amount: 1200,
    currency: "TRY",
    start_date: "2026-08-10",
    day_of_month: 10,
    total_installments: 12,
    paid_installments: 0,
    created_at: "2026-08-01T00:00:00Z",
    overrides: [],
    ...over,
  };
}

function makeRecurring(over: Partial<RecurringPayment> = {}): RecurringPayment {
  return {
    id: "r1",
    team_id: null,
    user_id: "u1",
    name: "Kira",
    currency: "TRY",
    day_of_month: 5,
    start_month: "2026-08-01",
    end_month: null,
    created_at: "2026-08-01T00:00:00Z",
    entries: [],
    ...over,
  };
}

function occurrence(over: Partial<Occurrence> = {}): Occurrence {
  return {
    kind: "installment",
    sourceId: "p1",
    name: "X",
    currency: "TRY",
    user_id: "u1",
    team_id: null,
    dueDate: new Date(2026, 7, 10),
    amount: 100,
    isPaid: false,
    ...over,
  };
}

describe("sumByCurrency", () => {
  it("keeps each currency on its own line", () => {
    const totals = sumByCurrency([
      occurrence({ currency: "TRY", amount: 100 }),
      occurrence({ currency: "USD", amount: 25 }),
      occurrence({ currency: "TRY", amount: 50 }),
    ]);
    expect(totals).toEqual({ TRY: 150, USD: 25 });
  });

  it("skips amount-less occurrences instead of counting them as zero", () => {
    expect(sumByCurrency([occurrence({ amount: null }), occurrence({ amount: 40 })])).toEqual({ TRY: 40 });
  });

  it("defaults a blank currency to TRY", () => {
    expect(sumByCurrency([occurrence({ currency: "", amount: 10 })])).toEqual({ TRY: 10 });
  });

  it("returns nothing for an empty list", () => {
    expect(sumByCurrency([])).toEqual({});
  });
});

describe("formatCurrencyTotals", () => {
  it("joins the currencies with a plus", () => {
    expect(formatCurrencyTotals({ TRY: 1000, USD: 50 })).toBe("₺1.000,00 + $50,00");
  });

  it("is empty when there is nothing to show", () => {
    expect(formatCurrencyTotals({})).toBe("");
  });
});

describe("rangeReport", () => {
  const start = new Date(2026, 7, 1);
  const end = endOfDay(new Date(2026, 9, 31)); // Aug 1 – Oct 31

  it("includes recurring reminders, not just installments", () => {
    const report = rangeReport([makePayment()], [makeRecurring()], start, end);

    const kinds = new Set(report.occurrences.map((o) => o.kind));
    expect(kinds.has("installment")).toBe(true);
    expect(kinds.has("recurring")).toBe(true);
  });

  it("splits a multi-currency override into one line per currency", () => {
    const payment = makePayment({
      total_installments: 1,
      amount: 1000,
      overrides: [
        {
          id: "o1",
          payment_id: "p1",
          installment_index: 0,
          due_date: null,
          amount: null,
          amounts: [
            { currency: "TRY", amount: 600 },
            { currency: "USD", amount: 20 },
          ],
          created_at: "",
        },
      ],
    });

    const report = rangeReport([payment], [], start, end);
    expect(report.occurrences).toHaveLength(2);
    expect(report.due).toEqual({ TRY: 600, USD: 20 });
  });

  it("separates the paid part from the remaining part", () => {
    const payment = makePayment({ total_installments: 3, amount: 300, paid_installments: 1 });
    const report = rangeReport([payment], [], start, end);

    expect(report.due).toEqual({ TRY: 300 });
    expect(report.paid).toEqual({ TRY: 100 });
    expect(report.remaining).toEqual({ TRY: 200 });
  });

  it("excludes occurrences outside the range", () => {
    const payment = makePayment({ total_installments: 12, amount: 1200 });
    const narrow = rangeReport([payment], [], new Date(2026, 7, 1), endOfDay(new Date(2026, 7, 31)));

    expect(narrow.occurrences).toHaveLength(1);
    expect(narrow.due).toEqual({ TRY: 100 });
  });

  it("returns an empty report for an inverted range", () => {
    const report = rangeReport([makePayment()], [makeRecurring()], end, start);
    expect(report).toEqual({ occurrences: [], due: {}, paid: {}, remaining: {} });
  });

  it("sorts the occurrences by date", () => {
    const report = rangeReport([makePayment({ total_installments: 3, amount: 300 })], [makeRecurring()], start, end);
    const times = report.occurrences.map((o) => o.dueDate.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("payUntilReport", () => {
  const today = startOfDay(new Date(2026, 7, 1));
  const end = endOfDay(new Date(2026, 9, 31));

  it("keeps only what is still unpaid", () => {
    const payment = makePayment({ total_installments: 3, amount: 300, paid_installments: 1 });
    const report = payUntilReport([payment], [], today, end);

    expect(report.occurrences.every((o) => !o.isPaid)).toBe(true);
    expect(report.byCurrency).toEqual({ TRY: 200 });
  });

  it("counts recurring reminders too", () => {
    const report = payUntilReport([], [makeRecurring()], today, end);
    expect(report.occurrences.length).toBeGreaterThan(0);
  });

  it("is empty when the end date is before today", () => {
    expect(payUntilReport([makePayment()], [makeRecurring()], end, today)).toEqual({
      occurrences: [],
      byCurrency: {},
    });
  });
});

describe("day boundaries", () => {
  it("startOfDay keeps a payment due earlier today in range", () => {
    const midday = new Date(2026, 7, 13, 12, 30);
    const start = startOfDay(midday);
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("endOfDay keeps a payment due later today in range", () => {
    const end = endOfDay(new Date(2026, 7, 13, 12, 30));
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
  });
});
