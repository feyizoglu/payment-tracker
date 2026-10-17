import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  getEvent: vi.fn(),
  listParticipants: vi.fn(),
  insertExpense: vi.fn(),
  replaceExpense: vi.fn(),
  expenseEventId: vi.fn(),
  deleteExpense: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import * as repo from "@/lib/events-repo";
import { POST } from "./route";
import { DELETE, PUT } from "./[eid]/route";

const EVENT_ID = "00000000-0000-4000-8000-0000000000e1";
const OTHER_EVENT_ID = "00000000-0000-4000-8000-0000000000e2";
const EXPENSE_ID = "00000000-0000-4000-8000-0000000000f1";
const openEvent = { id: EVENT_ID, created_by: "u1", status: "open" };
const closedEvent = { ...openEvent, status: "closed" };
const body = {
  description: "Dinner",
  amount_minor: 200,
  currency: "TRY",
  paid_by: "p1",
  spent_on: "2026-10-16",
  split: { kind: "equal", participant_ids: ["p1", "p2"] },
};
const req = (method: string, b?: unknown) => new Request("http://localhost/x", { method, body: b ? JSON.stringify(b) : undefined });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
  vi.mocked(repo.findMyParticipant).mockResolvedValue({ id: "p1" });
  vi.mocked(repo.listParticipants).mockResolvedValue([{ id: "p1" }, { id: "p2" }] as never);
  vi.mocked(repo.insertExpense).mockResolvedValue({ id: EXPENSE_ID });
  vi.mocked(repo.getEvent).mockResolvedValue(openEvent as never);
});

describe("POST expenses", () => {
  it("stores the expense with computed shares", async () => {
    const res = await POST(req("POST", body) as never, { params: Promise.resolve({ id: EVENT_ID }) });
    expect(res.status).toBe(201);
    expect(repo.insertExpense).toHaveBeenCalledWith(
      {},
      EVENT_ID,
      "u1",
      { description: "Dinner", amount_minor: 200, currency: "TRY", paid_by: "p1", spent_on: "2026-10-16" },
      [{ participant_id: "p1", amount_minor: 100 }, { participant_id: "p2", amount_minor: 100 }]
    );
  });

  it("400s an invalid expense", async () => {
    const res = await POST(req("POST", { ...body, paid_by: "p9" }) as never, { params: Promise.resolve({ id: EVENT_ID }) });
    expect(res.status).toBe(400);
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });

  it("409s on a closed event", async () => {
    vi.mocked(repo.getEvent).mockResolvedValue(closedEvent as never);
    const res = await POST(req("POST", body) as never, { params: Promise.resolve({ id: EVENT_ID }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Event is closed" });
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });

  it("404s a non-UUID event id without a repo call", async () => {
    const res = await POST(req("POST", body) as never, { params: Promise.resolve({ id: "e1" }) });
    expect(res.status).toBe(404);
    expect(repo.findMyParticipant).not.toHaveBeenCalled();
    expect(repo.insertExpense).not.toHaveBeenCalled();
  });
});

describe("PUT/DELETE expense", () => {
  const ctx = { params: Promise.resolve({ id: EVENT_ID, eid: EXPENSE_ID }) };

  it("404s an expense that belongs to another event", async () => {
    vi.mocked(repo.expenseEventId).mockResolvedValue(OTHER_EVENT_ID);
    expect((await PUT(req("PUT", body) as never, ctx)).status).toBe(404);
    expect((await DELETE(req("DELETE") as never, ctx)).status).toBe(404);
    expect(repo.replaceExpense).not.toHaveBeenCalled();
    expect(repo.deleteExpense).not.toHaveBeenCalled();
  });

  it("replaces and deletes an expense of this event", async () => {
    vi.mocked(repo.expenseEventId).mockResolvedValue(EVENT_ID);
    expect((await PUT(req("PUT", body) as never, ctx)).status).toBe(200);
    expect(repo.replaceExpense).toHaveBeenCalled();
    expect((await DELETE(req("DELETE") as never, ctx)).status).toBe(204);
    expect(repo.deleteExpense).toHaveBeenCalledWith({}, EXPENSE_ID);
  });

  it("404s a non-UUID expense id without looking it up", async () => {
    const badCtx = { params: Promise.resolve({ id: EVENT_ID, eid: "x1" }) };
    expect((await PUT(req("PUT", body) as never, badCtx)).status).toBe(404);
    expect((await DELETE(req("DELETE") as never, badCtx)).status).toBe(404);
    expect(repo.expenseEventId).not.toHaveBeenCalled();
  });

  it("409s on a closed event", async () => {
    vi.mocked(repo.getEvent).mockResolvedValue(closedEvent as never);
    vi.mocked(repo.expenseEventId).mockResolvedValue(EVENT_ID);
    expect((await PUT(req("PUT", body) as never, ctx)).status).toBe(409);
    expect((await DELETE(req("DELETE") as never, ctx)).status).toBe(409);
    expect(repo.replaceExpense).not.toHaveBeenCalled();
    expect(repo.deleteExpense).not.toHaveBeenCalled();
  });

  it("400s an invalid expense without replacing it", async () => {
    vi.mocked(repo.expenseEventId).mockResolvedValue(EVENT_ID);
    expect((await PUT(req("PUT", { ...body, paid_by: "p9" }) as never, ctx)).status).toBe(400);
    expect(repo.replaceExpense).not.toHaveBeenCalled();
  });

  it("replaces the expense with the computed shares", async () => {
    vi.mocked(repo.expenseEventId).mockResolvedValue(EVENT_ID);
    expect((await PUT(req("PUT", body) as never, ctx)).status).toBe(200);
    expect(repo.replaceExpense).toHaveBeenCalledWith(
      {},
      EXPENSE_ID,
      { description: "Dinner", amount_minor: 200, currency: "TRY", paid_by: "p1", spent_on: "2026-10-16" },
      [{ participant_id: "p1", amount_minor: 100 }, { participant_id: "p2", amount_minor: 100 }]
    );
  });
});
