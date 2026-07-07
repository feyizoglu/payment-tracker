import { describe, it, expect } from "vitest";
import { getOccurrencesForMonth, getCurrencySymbol } from "@ptracker/shared/payments";
import type { Payment } from "@ptracker/shared/types";

// Proves the shared occurrence logic resolves through the mobile toolchain
// via the @ptracker/shared local package (Metro/node + date-fns) — not a
// re-test of the logic itself (that lives in the web-side payments.test.ts).
describe("shared/payments wiring (mobile)", () => {
  it("resolves and computes a July installment occurrence", () => {
    const payment: Payment = {
      id: "p1", team_id: null, user_id: "u1", name: "Laptop",
      amount: 1200, currency: "TRY", start_date: "2026-07-10",
      day_of_month: 10, total_installments: 12, paid_installments: 0,
      created_at: "2026-07-01T00:00:00Z",
    };
    const occ = getOccurrencesForMonth([payment], [], 2026, 6); // July
    expect(occ.length).toBe(1);
    expect(occ[0].dueDate.getDate()).toBe(10);
  });

  it("exposes currency symbols", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
  });
});
