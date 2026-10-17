import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  getEvent: vi.fn(),
  listParticipants: vi.fn(),
  insertSettlement: vi.fn(),
  settlementEventId: vi.fn(),
  deleteSettlement: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import * as repo from "@/lib/events-repo";
import { POST } from "./route";
import { DELETE } from "./[sid]/route";

const EVENT_ID = "00000000-0000-4000-8000-0000000000e1";
const OTHER_EVENT_ID = "00000000-0000-4000-8000-0000000000e2";
const SETTLEMENT_ID = "00000000-0000-4000-8000-0000000000d1";
const openEvent = { id: EVENT_ID, created_by: "u1", status: "open" };
const closedEvent = { ...openEvent, status: "closed" };
const ok = { from_participant: "p2", to_participant: "p1", amount_minor: 100, currency: "TRY" };
const post = (b: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(b) });
const ctx = { params: Promise.resolve({ id: EVENT_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
  vi.mocked(repo.findMyParticipant).mockResolvedValue({ id: "p1" });
  vi.mocked(repo.listParticipants).mockResolvedValue([{ id: "p1" }, { id: "p2" }] as never);
  vi.mocked(repo.insertSettlement).mockResolvedValue({ id: SETTLEMENT_ID } as never);
  vi.mocked(repo.getEvent).mockResolvedValue(openEvent as never);
});

describe("POST settlements", () => {
  it("records a payment between two participants", async () => {
    expect((await POST(post(ok) as never, ctx)).status).toBe(201);
    expect(repo.insertSettlement).toHaveBeenCalledWith({}, EVENT_ID, "u1", ok);
  });

  it("409s on a closed event", async () => {
    vi.mocked(repo.getEvent).mockResolvedValue(closedEvent as never);
    const res = await POST(post(ok) as never, ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Event is closed" });
    expect(repo.insertSettlement).not.toHaveBeenCalled();
  });

  it.each([
    ["same person", { ...ok, to_participant: "p2" }],
    ["outside participant", { ...ok, from_participant: "p9" }],
    ["zero amount", { ...ok, amount_minor: 0 }],
    ["bad currency", { ...ok, currency: "JPY" }],
  ])("400s a %s", async (_, b) => {
    expect((await POST(post(b) as never, ctx)).status).toBe(400);
  });
});

describe("DELETE settlement", () => {
  const dctx = { params: Promise.resolve({ id: EVENT_ID, sid: SETTLEMENT_ID }) };
  const del = () => new Request("http://localhost/x", { method: "DELETE" });

  it("404s a payment of another event and deletes one of this event", async () => {
    vi.mocked(repo.settlementEventId).mockResolvedValue(OTHER_EVENT_ID);
    expect((await DELETE(del() as never, dctx)).status).toBe(404);
    vi.mocked(repo.settlementEventId).mockResolvedValue(EVENT_ID);
    expect((await DELETE(del() as never, dctx)).status).toBe(204);
    expect(repo.deleteSettlement).toHaveBeenCalledWith({}, SETTLEMENT_ID);
  });

  it("404s a non-UUID payment id without looking it up", async () => {
    const res = await DELETE(del() as never, { params: Promise.resolve({ id: EVENT_ID, sid: "s1" }) });
    expect(res.status).toBe(404);
    expect(repo.settlementEventId).not.toHaveBeenCalled();
  });

  it("409s on a closed event", async () => {
    vi.mocked(repo.getEvent).mockResolvedValue(closedEvent as never);
    vi.mocked(repo.settlementEventId).mockResolvedValue(EVENT_ID);
    expect((await DELETE(del() as never, dctx)).status).toBe(409);
    expect(repo.deleteSettlement).not.toHaveBeenCalled();
  });
});
