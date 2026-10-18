import { describe, it, expect } from "vitest";
import { balances, canRemoveParticipant, buildShares, parseDecimalToMinor, participantLabel, splitEqually, suggestTransfers } from "./split";
import type { EventExpense, EventParticipant, EventSettlement } from "@/types";

const exp = (paid_by: string, amount_minor: number, currency: string, shares: [string, number][]): EventExpense => ({
  id: `${paid_by}-${amount_minor}-${currency}`,
  event_id: "e",
  description: "x",
  amount_minor,
  currency,
  paid_by,
  spent_on: "2026-10-16",
  created_by: "u",
  created_at: "",
  shares: shares.map(([participant_id, amount]) => ({ participant_id, amount_minor: amount })),
});

const settle = (from: string, to: string, amount_minor: number, currency: string): EventSettlement => ({
  id: `${from}-${to}`,
  event_id: "e",
  from_participant: from,
  to_participant: to,
  amount_minor,
  currency,
  created_by: "u",
  created_at: "",
});

describe("splitEqually", () => {
  it("gives the leftover minor units to the first participants", () => {
    expect(splitEqually(10000, ["a", "b", "c"])).toEqual([
      { participant_id: "a", amount_minor: 3334 },
      { participant_id: "b", amount_minor: 3333 },
      { participant_id: "c", amount_minor: 3333 },
    ]);
  });

  it("splits evenly when it divides", () => {
    expect(splitEqually(900, ["a", "b", "c"]).map((s) => s.amount_minor)).toEqual([300, 300, 300]);
  });
});

describe("buildShares", () => {
  const ids = ["a", "b", "c"];

  it("orders an equal split by event participant order, not by request order", () => {
    const r = buildShares(100, { kind: "equal", participant_ids: ["c", "a"] }, ids);
    expect(r).toEqual({ ok: true, shares: [{ participant_id: "a", amount_minor: 50 }, { participant_id: "c", amount_minor: 50 }] });
  });

  it("rejects an empty or foreign or duplicate equal split", () => {
    expect(buildShares(100, { kind: "equal", participant_ids: [] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "equal", participant_ids: ["z"] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "equal", participant_ids: ["a", "a"] }, ids).ok).toBe(false);
  });

  it("accepts exact shares that add up and drops zero shares", () => {
    const r = buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 100 }, { participant_id: "b", amount_minor: 0 }] }, ids);
    expect(r).toEqual({ ok: true, shares: [{ participant_id: "a", amount_minor: 100 }] });
  });

  it("rejects exact shares that do not add up, are negative, fractional or foreign", () => {
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 90 }] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 110 }, { participant_id: "b", amount_minor: -10 }] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "a", amount_minor: 99.5 }, { participant_id: "b", amount_minor: 0.5 }] }, ids).ok).toBe(false);
    expect(buildShares(100, { kind: "exact", shares: [{ participant_id: "z", amount_minor: 100 }] }, ids).ok).toBe(false);
  });
});

describe("balances", () => {
  it("is paid minus share, per currency", () => {
    const b = balances(
      [exp("a", 300, "TRY", [["a", 100], ["b", 100], ["c", 100]]), exp("b", 20, "EUR", [["a", 10], ["b", 10]])],
      []
    );
    expect(b).toEqual({ TRY: { a: 200, b: -100, c: -100 }, EUR: { a: -10, b: 10 } });
  });

  it("moves a recorded payment toward zero", () => {
    const b = balances([exp("a", 300, "TRY", [["a", 100], ["b", 100], ["c", 100]])], [settle("b", "a", 60, "TRY")]);
    expect(b.TRY).toEqual({ a: 140, b: -40, c: -100 });
  });
});

describe("suggestTransfers", () => {
  it("matches the largest debtor with the largest creditor", () => {
    expect(suggestTransfers({ TRY: { a: 200, b: -100, c: -100 } })).toEqual([
      { from: "b", to: "a", amount_minor: 100, currency: "TRY" },
      { from: "c", to: "a", amount_minor: 100, currency: "TRY" },
    ]);
  });

  it("handles several creditors and keeps currencies apart", () => {
    const t = suggestTransfers({ TRY: { a: 150, b: 50, c: -200 }, EUR: { a: -10, b: 10 } });
    expect(t).toEqual([
      { from: "a", to: "b", amount_minor: 10, currency: "EUR" },
      { from: "c", to: "a", amount_minor: 150, currency: "TRY" },
      { from: "c", to: "b", amount_minor: 50, currency: "TRY" },
    ]);
  });

  it("is empty when everyone is even", () => {
    expect(suggestTransfers({ TRY: { a: 0, b: 0 } })).toEqual([]);
  });
});

describe("participantLabel", () => {
  it("prefers the user's name, then email, then the display name", () => {
    const base = { id: "p", event_id: "e", created_at: "" } as const;
    expect(participantLabel({ ...base, user_id: "u", display_name: null, user: { id: "u", name: "Ali", email: "a@x", color: null } } as EventParticipant)).toBe("Ali");
    expect(participantLabel({ ...base, user_id: "u", display_name: null, user: { id: "u", name: null, email: "a@x", color: null } } as EventParticipant)).toBe("a@x");
    expect(participantLabel({ ...base, user_id: null, display_name: "Can" } as EventParticipant)).toBe("Can");
  });
});

describe("parseDecimalToMinor", () => {
  it("reads whole and decimal amounts with a dot or a comma", () => {
    expect(parseDecimalToMinor("12")).toBe(1200);
    expect(parseDecimalToMinor("12.5")).toBe(1250);
    expect(parseDecimalToMinor("12,50")).toBe(1250);
    expect(parseDecimalToMinor(" 0.29 ")).toBe(29);
    expect(parseDecimalToMinor("1.15")).toBe(115);
    expect(parseDecimalToMinor("4.35")).toBe(435);
    expect(parseDecimalToMinor("0")).toBe(0);
  });

  it("rejects malformed, over-precise and negative amounts", () => {
    for (const bad of ["", " ", "1e3", "1.2.3", "0.285", "-5", "+5", ".5", "5.", "abc", "1,2,3", "12 50"]) {
      expect(parseDecimalToMinor(bad)).toBeNull();
    }
  });
});

describe("buildShares exact share objects", () => {
  it("returns fresh objects with only participant_id and amount_minor", () => {
    const input = [{ participant_id: "a", amount_minor: 100, expense_id: "x", extra: 1 }];
    const r = buildShares(100, { kind: "exact", shares: input }, ["a", "b"]);
    expect(r).toEqual({ ok: true, shares: [{ participant_id: "a", amount_minor: 100 }] });
    if (r.ok) expect(r.shares[0]).not.toBe(input[0]);
  });
});

describe("buildShares duplicate exact participants", () => {
  it("rejects an exact split that names one participant twice", () => {
    const shares = [{ participant_id: "a", amount_minor: 50 }, { participant_id: "a", amount_minor: 50 }];
    expect(buildShares(100, { kind: "exact", shares }, ["a", "b"])).toEqual({ ok: false, error: "Invalid participants" });
  });
});

describe("parseDecimalToMinor safe-integer range", () => {
  it("returns null past the safe-integer range", () => {
    expect(parseDecimalToMinor("99999999999999999")).toBeNull();
  });
});

describe("canRemoveParticipant", () => {
  const event = { created_by: "creator" };

  it("lets the creator remove anyone but themselves", () => {
    expect(canRemoveParticipant(event, { user_id: "mate" }, "creator")).toBe(true);
    expect(canRemoveParticipant(event, { user_id: null }, "creator")).toBe(true);
    expect(canRemoveParticipant(event, { user_id: "creator" }, "creator")).toBe(false);
  });

  it("lets anyone else only leave", () => {
    expect(canRemoveParticipant(event, { user_id: "mate" }, "mate")).toBe(true);
    expect(canRemoveParticipant(event, { user_id: "other" }, "mate")).toBe(false);
    expect(canRemoveParticipant(event, { user_id: null }, "mate")).toBe(false);
  });

  it("refuses without a signed-in user", () => {
    expect(canRemoveParticipant(event, { user_id: null }, undefined)).toBe(false);
  });
});
