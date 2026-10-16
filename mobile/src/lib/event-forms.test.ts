import { describe, it, expect } from "vitest";
import type { EventExpense, EventParticipant } from "@ptracker/shared/types";
import { emptyExpenseForm, expenseFormFromExpense, expenseFormToBody, remainingMinor } from "./event-forms";

const P = (id: string): EventParticipant => ({ id, event_id: "e", user_id: null, display_name: id, created_at: "" });
const participants = [P("p1"), P("p2"), P("p3")];

describe("emptyExpenseForm", () => {
  it("defaults to me as payer, everyone selected, equal split, TRY, today", () => {
    expect(emptyExpenseForm(participants, "p2", "2026-10-16")).toEqual({
      description: "",
      amount: "",
      currency: "TRY",
      paidBy: "p2",
      spentOn: "2026-10-16",
      mode: "equal",
      selected: ["p1", "p2", "p3"],
      exact: { p1: "", p2: "", p3: "" },
    });
  });

  it("falls back to the first participant when my id is not in the list", () => {
    expect(emptyExpenseForm(participants, "zzz", "2026-10-16").paidBy).toBe("p1");
  });

  it("falls back to the first participant when I am not found", () => {
    expect(emptyExpenseForm(participants, null, "2026-10-16").paidBy).toBe("p1");
  });
});

describe("expenseFormToBody", () => {
  const base = { ...emptyExpenseForm(participants, "p1", "2026-10-16"), description: " Dinner ", amount: "90,00" };

  it("builds an equal split body", () => {
    expect(expenseFormToBody({ ...base, selected: ["p3", "p1"] }, participants)).toEqual({
      ok: true,
      body: {
        description: "Dinner",
        amount_minor: 9000,
        currency: "TRY",
        paid_by: "p1",
        spent_on: "2026-10-16",
        split: { kind: "equal", participant_ids: ["p1", "p3"] },
      },
    });
  });

  it("builds an exact split body and drops empty inputs", () => {
    const r = expenseFormToBody({ ...base, mode: "exact", exact: { p1: "60", p2: "30", p3: "" } }, participants);
    expect(r).toEqual({
      ok: true,
      body: expect.objectContaining({
        split: { kind: "exact", shares: [{ participant_id: "p1", amount_minor: 6000 }, { participant_id: "p2", amount_minor: 3000 }] },
      }),
    });
  });

  it("drops an exact share of zero from the body", () => {
    const r = expenseFormToBody({ ...base, mode: "exact", exact: { p1: "90", p2: "0", p3: "" } }, participants);
    expect(r).toEqual({
      ok: true,
      body: expect.objectContaining({ split: { kind: "exact", shares: [{ participant_id: "p1", amount_minor: 9000 }] } }),
    });
  });

  it.each([
    ["blank description", { description: " " }, "description"],
    ["bad amount", { amount: "abc" }, "amount"],
    ["zero amount", { amount: "0" }, "amount"],
    ["nobody selected", { selected: [] }, "split"],
    ["exact not adding up", { mode: "exact" as const, exact: { p1: "10", p2: "", p3: "" } }, "split"],
    ["bad exact input", { mode: "exact" as const, exact: { p1: "1.234", p2: "", p3: "" } }, "split"],
  ])("rejects %s", (_, override, field) => {
    expect(expenseFormToBody({ ...base, ...override }, participants)).toEqual({ ok: false, field });
  });
});

describe("remainingMinor", () => {
  it("is amount minus the typed exact shares, null while something is unparsable", () => {
    const f = { ...emptyExpenseForm(participants, "p1", "2026-10-16"), amount: "100", mode: "exact" as const };
    expect(remainingMinor({ ...f, exact: { p1: "40", p2: "", p3: "" } })).toBe(6000);
    expect(remainingMinor({ ...f, exact: { p1: "x", p2: "", p3: "" } })).toBeNull();
    expect(remainingMinor({ ...f, amount: "" })).toBeNull();
  });
});

describe("expenseFormFromExpense", () => {
  const expense = (shares: [string, number][]): EventExpense => ({
    id: "x", event_id: "e", description: "Taxi", amount_minor: 10000, currency: "EUR", paid_by: "p2",
    spent_on: "2026-10-10", created_by: "u", created_at: "",
    shares: shares.map(([participant_id, amount_minor]) => ({ participant_id, amount_minor })),
  });

  it("opens an equal split as equal with those participants selected", () => {
    const f = expenseFormFromExpense(expense([["p1", 3334], ["p2", 3333], ["p3", 3333]]), participants);
    expect(f).toMatchObject({ description: "Taxi", amount: "100.00", currency: "EUR", paidBy: "p2", spentOn: "2026-10-10", mode: "equal", selected: ["p1", "p2", "p3"] });
  });

  it("opens an equal split over a subset as equal with only that subset selected", () => {
    const f = expenseFormFromExpense(expense([["p1", 5000], ["p3", 5000]]), participants);
    expect(f).toMatchObject({ mode: "equal", selected: ["p1", "p3"] });
  });

  it("opens anything else as exact with the stored amounts", () => {
    const f = expenseFormFromExpense(expense([["p1", 7000], ["p3", 3000]]), participants);
    expect(f).toMatchObject({ mode: "exact", exact: { p1: "70.00", p2: "", p3: "30.00" } });
  });
});
