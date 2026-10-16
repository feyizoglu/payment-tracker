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
