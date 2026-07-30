import { describe, it, expect } from "vitest";
import { decideEditSubmit } from "@/lib/edit-occurrence";
import { Occurrence } from "@/types";

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
