import { describe, it, expect } from "vitest";

import { parseExpenseInput } from "./expense-input";

const ids = ["p1", "p2", "p3"];
const valid = {
  description: " Dinner ",
  amount_minor: 300,
  currency: "TRY",
  paid_by: "p1",
  spent_on: "2026-10-16",
  split: { kind: "equal", participant_ids: ["p1", "p2", "p3"] },
};

describe("parseExpenseInput", () => {
  it("returns the row and the computed shares", () => {
    expect(parseExpenseInput(valid, ids)).toEqual({
      ok: true,
      row: { description: "Dinner", amount_minor: 300, currency: "TRY", paid_by: "p1", spent_on: "2026-10-16" },
      shares: [
        { participant_id: "p1", amount_minor: 100 },
        { participant_id: "p2", amount_minor: 100 },
        { participant_id: "p3", amount_minor: 100 },
      ],
    });
  });

  it.each([
    ["blank description", { description: " " }],
    ["zero amount", { amount_minor: 0 }],
    ["fractional amount", { amount_minor: 1.5 }],
    ["unknown currency", { currency: "JPY" }],
    ["payer outside the event", { paid_by: "pX" }],
    ["bad date", { spent_on: "16/10/2026" }],
    ["missing split", { split: null }],
    ["unknown split kind", { split: { kind: "percent" } }],
    ["shares not adding up", { split: { kind: "exact", shares: [{ participant_id: "p1", amount_minor: 10 }] } }],
  ])("rejects %s", (_, override) => {
    expect(parseExpenseInput({ ...valid, ...override }, ids).ok).toBe(false);
  });
});

describe("parseExpenseInput split shape", () => {
  it.each([
    ["an equal split with a non-string id", { kind: "equal", participant_ids: [1] }],
    ["an exact split with a string amount", { kind: "exact", shares: [{ participant_id: "p1", amount_minor: "300" }] }],
  ])("rejects %s as an invalid split", (_, split) => {
    expect(parseExpenseInput({ ...valid, split }, ids)).toEqual({ ok: false, error: "Invalid split" });
  });

  it("returns the given shares for a valid exact split", () => {
    const shares = [{ participant_id: "p1", amount_minor: 200 }, { participant_id: "p3", amount_minor: 100 }];
    const parsed = parseExpenseInput({ ...valid, split: { kind: "exact", shares } }, ids);
    expect(parsed).toEqual(expect.objectContaining({ ok: true, shares }));
  });

  it("keeps only participant_id and amount_minor from exact shares", () => {
    const shares = [
      { participant_id: "p1", amount_minor: 200, expense_id: "00000000-0000-4000-8000-000000000bad", extra: "x" },
      { participant_id: "p3", amount_minor: 100, expense_id: "00000000-0000-4000-8000-000000000bad" },
    ];
    const parsed = parseExpenseInput({ ...valid, split: { kind: "exact", shares } }, ids);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.shares).toEqual([
      { participant_id: "p1", amount_minor: 200 },
      { participant_id: "p3", amount_minor: 100 },
    ]);
    expect(parsed.shares.map((s) => Object.keys(s).sort())).toEqual([
      ["amount_minor", "participant_id"],
      ["amount_minor", "participant_id"],
    ]);
  });
});
