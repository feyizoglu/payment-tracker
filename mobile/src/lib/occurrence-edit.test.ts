import { describe, it, expect } from "vitest";
import type { Occurrence, Payment, RecurringPayment } from "@ptracker/shared/types";
import {
  parseOccurrenceRef,
  findOccurrence,
  initialAmountLines,
  parseAmountLines,
  occurrenceEditRoute,
  seriesEditRoute,
  shouldShowScope,
} from "@/lib/occurrence-edit";
import { decideEditSubmit } from "@ptracker/shared/edit-occurrence";

const installmentOcc: Occurrence = {
  kind: "installment",
  sourceId: "p1",
  name: "Laptop",
  currency: "TRY",
  user_id: "u1",
  team_id: null,
  dueDate: new Date(2026, 7, 10),
  amount: 100,
  isPaid: false,
  installmentIndex: 2,
  totalInstallments: 12,
};

const recurringOcc: Occurrence = {
  kind: "recurring",
  sourceId: "r1",
  name: "Rent",
  currency: "TRY",
  user_id: "u1",
  team_id: null,
  dueDate: new Date(2026, 7, 5),
  amount: null,
  isPaid: false,
  period: "2026-08-01",
};

const payment: Payment = {
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
  created_at: "",
};

const recurring: RecurringPayment = {
  id: "r1",
  team_id: null,
  user_id: "u1",
  name: "Rent",
  currency: "USD",
  day_of_month: 5,
  start_month: "2026-01-01",
  end_month: null,
  created_at: "",
};

describe("parseOccurrenceRef", () => {
  it("reads a recurring reference", () => {
    expect(parseOccurrenceRef({ kind: "recurring", sourceId: "r1", period: "2026-08-01" })).toEqual({
      kind: "recurring",
      sourceId: "r1",
      period: "2026-08-01",
    });
  });

  it("reads an installment reference, including index 0", () => {
    expect(parseOccurrenceRef({ kind: "installment", sourceId: "p1", installmentIndex: "0" })).toEqual({
      kind: "installment",
      sourceId: "p1",
      installmentIndex: 0,
    });
  });

  it("rejects missing or malformed params", () => {
    expect(parseOccurrenceRef({ kind: "recurring", sourceId: "r1" })).toBeNull();
    expect(parseOccurrenceRef({ kind: "installment", sourceId: "p1" })).toBeNull();
    expect(parseOccurrenceRef({ kind: "installment", sourceId: "p1", installmentIndex: "x" })).toBeNull();
    expect(parseOccurrenceRef({ kind: "installment", installmentIndex: "1" })).toBeNull();
    expect(parseOccurrenceRef({ kind: "other", sourceId: "p1" })).toBeNull();
  });
});

describe("findOccurrence", () => {
  const list = [installmentOcc, recurringOcc, { ...installmentOcc, installmentIndex: 3 }];

  it("matches on kind, source and index", () => {
    expect(findOccurrence(list, { kind: "installment", sourceId: "p1", installmentIndex: 3 })?.installmentIndex).toBe(3);
  });

  it("matches a recurring month by period", () => {
    expect(findOccurrence(list, { kind: "recurring", sourceId: "r1", period: "2026-08-01" })).toBe(recurringOcc);
  });

  it("returns null when nothing matches", () => {
    expect(findOccurrence(list, { kind: "recurring", sourceId: "r1", period: "2026-09-01" })).toBeNull();
  });
});

describe("initialAmountLines — installment", () => {
  it("falls back to the per-installment default", () => {
    expect(initialAmountLines(installmentOcc, [payment], [])).toEqual([{ currency: "TRY", amount: "100" }]);
  });

  it("prefers a multi-currency override", () => {
    const withOverride: Payment = {
      ...payment,
      overrides: [
        {
          id: "o1",
          payment_id: "p1",
          installment_index: 2,
          due_date: null,
          amount: null,
          amounts: [
            { currency: "USD", amount: 20 },
            { currency: "TRY", amount: 500 },
          ],
          created_at: "",
        },
      ],
    };
    expect(initialAmountLines(installmentOcc, [withOverride], [])).toEqual([
      { currency: "USD", amount: "20" },
      { currency: "TRY", amount: "500" },
    ]);
  });

  it("honours a legacy single-amount override", () => {
    const withLegacy: Payment = {
      ...payment,
      overrides: [
        { id: "o1", payment_id: "p1", installment_index: 2, due_date: null, amount: 75, created_at: "" },
      ],
    };
    expect(initialAmountLines(installmentOcc, [withLegacy], [])).toEqual([{ currency: "TRY", amount: "75" }]);
  });

  it("falls back to the occurrence itself when the series is missing", () => {
    expect(initialAmountLines(installmentOcc, [], [])).toEqual([{ currency: "TRY", amount: "100" }]);
  });
});

describe("initialAmountLines — recurring", () => {
  it("seeds a blank line in the series currency when there is no entry", () => {
    expect(initialAmountLines(recurringOcc, [], [recurring])).toEqual([{ currency: "USD", amount: "" }]);
  });

  it("prefers the month's entry amounts", () => {
    const withEntry: RecurringPayment = {
      ...recurring,
      entries: [
        {
          id: "e1",
          recurring_id: "r1",
          period: "2026-08-01",
          amount: null,
          amounts: [{ currency: "EUR", amount: 42 }],
          is_paid: false,
          paid_at: null,
          due_date: null,
          created_at: "",
        },
      ],
    };
    expect(initialAmountLines(recurringOcc, [], [withEntry])).toEqual([{ currency: "EUR", amount: "42" }]);
  });
});

describe("shouldShowScope", () => {
  it("asks only for a day move inside the same month", () => {
    expect(shouldShowScope(installmentOcc, "2026-08-20", "2026-08-10")).toBe(true);
  });

  it("stays hidden for an unchanged date", () => {
    expect(shouldShowScope(installmentOcc, "2026-08-10", "2026-08-10")).toBe(false);
  });

  it("stays hidden when the month changes — that is inherently a single override", () => {
    expect(shouldShowScope(installmentOcc, "2026-09-20", "2026-08-10")).toBe(false);
  });

  it("stays hidden before the occurrence has loaded", () => {
    expect(shouldShowScope(null, "2026-08-20", "2026-08-10")).toBe(false);
  });
});

describe("reset path", () => {
  // The screen sends `amounts: []` on reset; decideEditSubmit must ignore both the
  // amounts and a "forward" scope, or a reset would silently become a day-forward write.
  it("drops amounts and never forwards, even with scope 'forward'", () => {
    expect(
      decideEditSubmit({
        occurrence: recurringOcc,
        reset: true,
        scope: "forward",
        date: "2026-08-20",
        initialDate: "2026-08-05",
        amounts: [],
      })
    ).toEqual({
      url: "/api/recurring/r1/entry",
      body: { period: "2026-08-01", due_date: null },
    });
  });

  it("removes the whole override for an installment", () => {
    expect(
      decideEditSubmit({
        occurrence: installmentOcc,
        reset: true,
        scope: "forward",
        date: "2026-08-20",
        initialDate: "2026-08-10",
        amounts: [],
      })
    ).toEqual({
      url: "/api/payments/p1/override",
      body: { installment_index: 2, due_date: null, amount: null },
    });
  });
});

describe("routes", () => {
  it("round-trips an installment occurrence through parseOccurrenceRef", () => {
    const { params } = occurrenceEditRoute(installmentOcc, "2026-08-10");
    expect(params.dueDate).toBe("2026-08-10");
    expect(parseOccurrenceRef(params)).toEqual({
      kind: "installment",
      sourceId: "p1",
      installmentIndex: 2,
    });
  });

  it("round-trips a recurring occurrence", () => {
    const { params } = occurrenceEditRoute(recurringOcc, "2026-08-05");
    expect(parseOccurrenceRef(params)).toEqual({
      kind: "recurring",
      sourceId: "r1",
      period: "2026-08-01",
    });
  });

  it("points at the matching series screen", () => {
    expect(seriesEditRoute(installmentOcc)).toEqual({ pathname: "/payment/[id]", params: { id: "p1" } });
    expect(seriesEditRoute(recurringOcc)).toEqual({ pathname: "/recurring/[id]", params: { id: "r1" } });
  });
});

describe("parseAmountLines", () => {
  it("drops blank rows", () => {
    expect(
      parseAmountLines([
        { currency: "TRY", amount: "100" },
        { currency: "USD", amount: "   " },
      ])
    ).toEqual([{ currency: "TRY", amount: 100 }]);
  });

  it("returns an empty list when every row is blank (a pure date edit)", () => {
    expect(parseAmountLines([{ currency: "TRY", amount: "" }])).toEqual([]);
  });

  it("rejects non-positive and non-numeric amounts", () => {
    expect(parseAmountLines([{ currency: "TRY", amount: "0" }])).toBeNull();
    expect(parseAmountLines([{ currency: "TRY", amount: "-5" }])).toBeNull();
    expect(parseAmountLines([{ currency: "TRY", amount: "abc" }])).toBeNull();
  });
});
