import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));

import {
  addParticipant,
  createEvent,
  deleteParticipant,
  findUserByEmail,
  insertExpense,
  loadEventDetail,
  participantIsReferenced,
  replaceExpense,
  shareATeam,
} from "./events-repo";

type Result = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };
type Call = { table: string; ops: [string, unknown[]][] };

function fakeDb(results: Record<string, Result[]>) {
  const calls: Call[] = [];
  const db = {
    rpc(name: string, args: unknown) {
      calls.push({ table: name, ops: [["rpc", [args]]] });
      const result = (results[name] ?? []).shift() ?? {};
      return Promise.resolve({ data: null, error: null, ...result });
    },
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const result = (results[table] ?? []).shift() ?? {};
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null, ...result }).then(resolve, reject),
      };
      for (const m of ["select", "insert", "update", "delete", "eq", "ilike", "in", "order", "single", "maybeSingle"]) {
        builder[m] = (...args: unknown[]) => {
          call.ops.push([m, args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { db: db as never, calls };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("createEvent", () => {
  it("deletes the event and rejects when the creator's participant insert fails", async () => {
    const { db, calls } = fakeDb({
      events: [{ data: { id: "e1" } }, {}],
      event_participants: [{ error: { message: "participant insert failed" } }],
    });
    await expect(createEvent(db, "u1", "Trip", null)).rejects.toThrow("participant insert failed");
    const eventCalls = calls.filter((c) => c.table === "events");
    expect(eventCalls[1].ops).toEqual([["delete", []], ["eq", ["id", "e1"]]]);
  });

  it("logs a failed rollback delete and still rejects with the participant error", async () => {
    const rollbackError = { message: "rollback failed" };
    const { db } = fakeDb({
      events: [{ data: { id: "e1" } }, { error: rollbackError }],
      event_participants: [{ error: { message: "participant insert failed" } }],
    });
    await expect(createEvent(db, "u1", "Trip", null)).rejects.toThrow("participant insert failed");
    expect(console.error).toHaveBeenCalledWith("events-repo createEvent rollback:", rollbackError);
  });
});

describe("insertExpense", () => {
  const input = { description: "Dinner", amount_minor: 200, currency: "TRY", paid_by: "p1", spent_on: "2026-10-16" } as never;
  const shares = [{ participant_id: "p1", amount_minor: 100 }, { participant_id: "p2", amount_minor: 100 }];

  it("writes the expense and its shares in one RPC and returns the new id", async () => {
    const { db, calls } = fakeDb({ event_expense_insert: [{ data: "x1" }] });
    expect(await insertExpense(db, "e1", "u1", input, shares)).toEqual({ id: "x1" });
    expect(calls).toEqual([
      {
        table: "event_expense_insert",
        ops: [
          [
            "rpc",
            [
              {
                p_event_id: "e1",
                p_created_by: "u1",
                p_description: "Dinner",
                p_amount_minor: 200,
                p_currency: "TRY",
                p_paid_by: "p1",
                p_spent_on: "2026-10-16",
                p_shares: shares,
              },
            ],
          ],
        ],
      },
    ]);
  });

  it("sends only participant_id and amount_minor for each share", async () => {
    const { db, calls } = fakeDb({ event_expense_insert: [{ data: "x1" }] });
    const dirty = [{ participant_id: "p1", amount_minor: 200, expense_id: "other", extra: 1 }] as never;
    await insertExpense(db, "e1", "u1", input, dirty);
    const args = calls[0].ops[0][1][0] as { p_shares: unknown };
    expect(args.p_shares).toEqual([{ participant_id: "p1", amount_minor: 200 }]);
  });

  it("rejects when the RPC errors", async () => {
    const { db } = fakeDb({ event_expense_insert: [{ error: { message: "share insert failed" } }] });
    await expect(insertExpense(db, "e1", "u1", input, shares)).rejects.toThrow("share insert failed");
  });
});

describe("replaceExpense", () => {
  const input = { description: "Taxi", amount_minor: 300, currency: "EUR", paid_by: "p2", spent_on: "2026-10-15" } as never;
  const shares = [{ participant_id: "p1", amount_minor: 300 }];

  it("replaces the expense and its shares in one RPC", async () => {
    const { db, calls } = fakeDb({ event_expense_replace: [{}] });
    await expect(replaceExpense(db, "x1", input, shares)).resolves.toBeUndefined();
    expect(calls).toEqual([
      {
        table: "event_expense_replace",
        ops: [
          [
            "rpc",
            [
              {
                p_expense_id: "x1",
                p_description: "Taxi",
                p_amount_minor: 300,
                p_currency: "EUR",
                p_paid_by: "p2",
                p_spent_on: "2026-10-15",
                p_shares: shares,
              },
            ],
          ],
        ],
      },
    ]);
  });

  it("rejects when the RPC errors", async () => {
    const { db } = fakeDb({ event_expense_replace: [{ error: { message: "replace failed" } }] });
    await expect(replaceExpense(db, "x1", input, shares)).rejects.toThrow("replace failed");
  });
});

describe("findUserByEmail", () => {
  it("matches case-insensitively with LIKE wildcards and backslash escaped", async () => {
    const { db, calls } = fakeDb({ users: [{ data: { id: "u7" } }] });
    expect(await findUserByEmail(db, "A_b%c\\d@X.com")).toEqual({ id: "u7" });
    expect(calls[0].ops).toContainEqual(["ilike", ["email", "A\\_b\\%c\\\\d@X.com"]]);
  });

  it("refuses an email containing *, which PostgREST would treat as a wildcard", async () => {
    const { db, calls } = fakeDb({ users: [{ data: { id: "u7" } }] });
    expect(await findUserByEmail(db, "*@example.com")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("passes a plain email through unchanged", async () => {
    const { db, calls } = fakeDb({ users: [{ data: null }] });
    expect(await findUserByEmail(db, "Ann@Example.com")).toBeNull();
    expect(calls[0].ops).toContainEqual(["ilike", ["email", "Ann@Example.com"]]);
  });
});

describe("deleteParticipant", () => {
  it("is true when the row is deleted", async () => {
    const { db } = fakeDb({ event_participants: [{}] });
    expect(await deleteParticipant(db, "p1")).toBe(true);
  });

  it("is false on a foreign-key violation", async () => {
    const { db } = fakeDb({ event_participants: [{ error: { message: "fk", code: "23503" } }] });
    expect(await deleteParticipant(db, "p1")).toBe(false);
  });

  it("rejects on any other error", async () => {
    const { db } = fakeDb({ event_participants: [{ error: { message: "boom", code: "XX000" } }] });
    await expect(deleteParticipant(db, "p1")).rejects.toThrow("boom");
  });
});

describe("shareATeam", () => {
  it("is false when the users are in different teams", async () => {
    const { db } = fakeDb({
      team_members: [{ data: [{ team_id: "t1", user_id: "a" }, { team_id: "t2", user_id: "b" }] }],
    });
    expect(await shareATeam(db, "a", "b")).toBe(false);
  });

  it("is true when the users have a team in common", async () => {
    const { db } = fakeDb({
      team_members: [
        { data: [{ team_id: "t1", user_id: "a" }, { team_id: "t2", user_id: "b" }, { team_id: "t1", user_id: "b" }] },
      ],
    });
    expect(await shareATeam(db, "a", "b")).toBe(true);
  });
});

describe("addParticipant", () => {
  it("resolves to null on a unique violation", async () => {
    const { db } = fakeDb({ event_participants: [{ error: { message: "duplicate", code: "23505" } }] });
    expect(await addParticipant(db, "e1", { user_id: "u2" })).toBeNull();
  });

  it("rejects on any other error", async () => {
    const { db } = fakeDb({ event_participants: [{ error: { message: "fk violation", code: "23503" } }] });
    await expect(addParticipant(db, "e1", { user_id: "u2" })).rejects.toThrow("fk violation");
  });
});

describe("participantIsReferenced", () => {
  const counts = (paid: number, share: number, from: number, to: number) =>
    fakeDb({
      event_expenses: [{ count: paid }],
      event_expense_shares: [{ count: share }],
      event_settlements: [{ count: from }, { count: to }],
    });

  it("is true when only a settlement pays to the participant", async () => {
    expect(await participantIsReferenced(counts(0, 0, 0, 1).db, "p1")).toBe(true);
  });

  it("is false when nothing references the participant", async () => {
    expect(await participantIsReferenced(counts(0, 0, 0, 0).db, "p1")).toBe(false);
  });

  it("rejects when a check errors", async () => {
    const { db } = fakeDb({
      event_expenses: [{ count: 0 }],
      event_expense_shares: [{ error: { message: "shares check failed" } }],
      event_settlements: [{ count: 0 }, { count: 0 }],
    });
    await expect(participantIsReferenced(db, "p1")).rejects.toThrow("shares check failed");
  });
});

describe("loadEventDetail", () => {
  it("uses a preloaded event without querying events again", async () => {
    const { db, calls } = fakeDb({
      event_participants: [{ data: [] }],
      event_expenses: [{ data: [] }],
      event_settlements: [{ data: [] }],
    });
    const detail = await loadEventDetail(db, "e1", { id: "e1", name: "Trip" } as never);
    expect(detail).toEqual({ id: "e1", name: "Trip", participants: [], expenses: [], settlements: [] });
    expect(calls.map((c) => c.table)).not.toContain("events");
  });

  it("returns null without loading children when the event is missing", async () => {
    const { db, calls } = fakeDb({ events: [{ data: null }] });
    expect(await loadEventDetail(db, "e1")).toBeNull();
    expect(calls.map((c) => c.table)).toEqual(["events"]);
  });

  it("merges participants, expenses and settlements into the event", async () => {
    const { db } = fakeDb({
      events: [{ data: { id: "e1", name: "Trip" } }],
      event_participants: [{ data: [{ id: "p1" }] }],
      event_expenses: [{ data: [{ id: "x1" }] }],
      event_settlements: [{ data: [{ id: "s1" }] }],
    });
    expect(await loadEventDetail(db, "e1")).toEqual({
      id: "e1",
      name: "Trip",
      participants: [{ id: "p1" }],
      expenses: [{ id: "x1" }],
      settlements: [{ id: "s1" }],
    });
  });

  it("rejects when the expenses query errors", async () => {
    const { db } = fakeDb({
      events: [{ data: { id: "e1" } }],
      event_expenses: [{ error: { message: "expenses failed" } }],
    });
    await expect(loadEventDetail(db, "e1")).rejects.toThrow("expenses failed");
  });

  it("rejects when the settlements query errors", async () => {
    const { db } = fakeDb({
      events: [{ data: { id: "e1" } }],
      event_settlements: [{ error: { message: "settlements failed" } }],
    });
    await expect(loadEventDetail(db, "e1")).rejects.toThrow("settlements failed");
  });
});
