import { describe, it, expect } from "vitest";
import { markPaidRequest, occurrenceKey, groupOccurrencesByDay } from "./occurrences";
import type { Occurrence } from "@ptracker/shared/types";

function occ(over: Partial<Occurrence>): Occurrence {
  return {
    kind: "installment", sourceId: "p1", name: "Laptop", currency: "TRY",
    user_id: "u1", team_id: null, dueDate: new Date(2026, 6, 10), amount: 100,
    isPaid: false, installmentIndex: 2, totalInstallments: 12, ...over,
  };
}

describe("markPaidRequest", () => {
  it("marks an unpaid installment paid by advancing paid_installments to index+1", () => {
    const r = markPaidRequest(occ({ kind: "installment", installmentIndex: 2, isPaid: false }));
    expect(r).toEqual({ url: "/api/payments/p1", method: "PATCH", body: { paid_installments: 3 } });
  });
  it("unmarks a paid installment by setting paid_installments back to its index", () => {
    const r = markPaidRequest(occ({ kind: "installment", installmentIndex: 2, isPaid: true }));
    expect(r.body).toEqual({ paid_installments: 2 });
  });
  it("toggles a recurring entry via PUT with the period", () => {
    const r = markPaidRequest(occ({ kind: "recurring", sourceId: "r1", period: "2026-07-01", isPaid: false, installmentIndex: undefined }));
    expect(r).toEqual({ url: "/api/recurring/r1/entry", method: "PUT", body: { period: "2026-07-01", is_paid: true } });
  });
});

describe("occurrenceKey", () => {
  it("is unique across installment lines and currencies", () => {
    const a = occurrenceKey(occ({ installmentIndex: 0, currency: "TRY" }));
    const b = occurrenceKey(occ({ installmentIndex: 0, currency: "USD" }));
    const c = occurrenceKey(occ({ installmentIndex: 1, currency: "TRY" }));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("groupOccurrencesByDay", () => {
  it("groups by calendar day and sorts ascending", () => {
    const groups = groupOccurrencesByDay([
      occ({ dueDate: new Date(2026, 6, 20), name: "B" }),
      occ({ dueDate: new Date(2026, 6, 5), name: "A" }),
      occ({ dueDate: new Date(2026, 6, 5), name: "A2" }),
    ]);
    expect(groups.map((g) => g.date.getDate())).toEqual([5, 20]);
    expect(groups[0].items.map((o) => o.name)).toEqual(["A", "A2"]);
  });
});
