import { describe, it, expect } from "vitest";
import { planMarkPaid, withRecurringEntry, type ListEdit } from "./mark-paid";
import type { Occurrence, Payment, RecurringEntry, RecurringPayment } from "@/types";

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: "p-1",
  team_id: null,
  user_id: "u-1",
  name: "Loan",
  amount: 100,
  currency: "TRY",
  start_date: "2026-01-15",
  day_of_month: 15,
  total_installments: 12,
  paid_installments: 2,
  created_at: "",
  overrides: [{ id: "o-1", payment_id: "p-1", installment_index: 4, due_date: null, amount: 50, created_at: "" }],
  ...over,
});

const entry = (over: Partial<RecurringEntry> = {}): RecurringEntry => ({
  id: "e-1",
  recurring_id: "r-1",
  period: "2026-11-01",
  amount: 300,
  amounts: null,
  is_paid: false,
  paid_at: null,
  due_date: "2026-11-03",
  created_at: "2026-10-01",
  ...over,
});

const recurring = (entries?: RecurringEntry[]): RecurringPayment => ({
  id: "r-1",
  team_id: null,
  user_id: "u-1",
  name: "Rent",
  currency: "TRY",
  day_of_month: 1,
  start_month: "2026-01-01",
  end_month: null,
  created_at: "",
  entries,
});

const installment = (over: Partial<Occurrence> = {}): Occurrence => ({
  kind: "installment",
  sourceId: "p-1",
  name: "Loan",
  currency: "TRY",
  user_id: "u-1",
  team_id: null,
  dueDate: new Date(2026, 2, 15),
  amount: 100,
  isPaid: false,
  installmentIndex: 2,
  totalInstallments: 12,
  ...over,
});

const monthly = (over: Partial<Occurrence> = {}): Occurrence => ({
  kind: "recurring",
  sourceId: "r-1",
  name: "Rent",
  currency: "TRY",
  user_id: "u-1",
  team_id: null,
  dueDate: new Date(2026, 10, 1),
  amount: 300,
  isPaid: false,
  period: "2026-11-01",
  ...over,
});

const apply = (edit: ListEdit, payments: Payment[], recurrings: RecurringPayment[]) => ({
  payments: edit.payments ? edit.payments(payments) : payments,
  recurrings: edit.recurrings ? edit.recurrings(recurrings) : recurrings,
});

describe("planMarkPaid for an installment", () => {
  it("advances paid_installments at once and keeps the payment's overrides", () => {
    const plan = planMarkPaid(installment());
    expect(plan.request).toEqual({ url: "/api/payments/p-1", method: "PATCH", body: { paid_installments: 3 } });

    const other = payment({ id: "p-2", paid_installments: 0 });
    const next = apply(plan.optimistic, [payment(), other], []);
    expect(next.payments[0].paid_installments).toBe(3);
    expect(next.payments[0].overrides).toEqual(payment().overrides);
    expect(next.payments[1]).toBe(other);
  });

  it("rewinds to the installment's index when it was already paid", () => {
    const plan = planMarkPaid(installment({ isPaid: true }));
    expect(apply(plan.optimistic, [payment({ paid_installments: 3 })], []).payments[0].paid_installments).toBe(2);
  });

  it("takes the count the server stored over the optimistic one", () => {
    const plan = planMarkPaid(installment());
    const next = apply(plan.confirmed({ id: "p-1", paid_installments: 5 }), [payment({ paid_installments: 3 })], []);
    expect(next.payments[0].paid_installments).toBe(5);
  });

  it("changes nothing when the reply has no paid count", () => {
    expect(planMarkPaid(installment()).confirmed(null)).toEqual({});
    expect(planMarkPaid(installment()).confirmed({ error: "x" })).toEqual({});
  });
});

describe("planMarkPaid for a recurring period", () => {
  it("flips the existing entry and keeps its amount and due date", () => {
    const plan = planMarkPaid(monthly());
    expect(plan.request).toEqual({
      url: "/api/recurring/r-1/entry",
      method: "PUT",
      body: { period: "2026-11-01", is_paid: true },
    });

    const [r] = apply(plan.optimistic, [], [recurring([entry()])]).recurrings;
    expect(r.entries).toHaveLength(1);
    expect(r.entries![0]).toMatchObject({ id: "e-1", is_paid: true, amount: 300, due_date: "2026-11-03" });
    expect(r.entries![0].paid_at).not.toBeNull();
  });

  it("adds an entry for a period that has none yet", () => {
    const plan = planMarkPaid(monthly());
    const [r] = apply(plan.optimistic, [], [recurring()]).recurrings;
    expect(r.entries).toEqual([expect.objectContaining({ period: "2026-11-01", is_paid: true, amount: null })]);
  });

  it("clears paid_at when unmarking", () => {
    const plan = planMarkPaid(monthly({ isPaid: true }));
    const [r] = apply(plan.optimistic, [], [recurring([entry({ is_paid: true, paid_at: "x" })])]).recurrings;
    expect(r.entries![0]).toMatchObject({ is_paid: false, paid_at: null });
  });

  it("stores the server's entry, replacing the placeholder", () => {
    const plan = planMarkPaid(monthly());
    const optimistic = apply(plan.optimistic, [], [recurring()]).recurrings;
    const stored = entry({ id: "e-9", is_paid: true, paid_at: "2026-11-02T10:00:00Z" });
    const [r] = apply(plan.confirmed(stored), [], optimistic).recurrings;
    expect(r.entries).toEqual([stored]);
  });

  it("ignores a reply for another period", () => {
    expect(planMarkPaid(monthly()).confirmed(entry({ period: "2026-12-01" }))).toEqual({});
  });
});

describe("withRecurringEntry", () => {
  it("leaves other recurring payments untouched", () => {
    const other = { ...recurring([entry()]), id: "r-2" };
    const [, untouched] = withRecurringEntry([recurring(), other], "r-1", { period: "2026-11-01", is_paid: true });
    expect(untouched).toBe(other);
  });
});
