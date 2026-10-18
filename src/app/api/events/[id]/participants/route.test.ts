import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  findUserByEmail: vi.fn(),
  shareATeam: vi.fn(),
  addParticipant: vi.fn(),
  getEvent: vi.fn(),
  listParticipants: vi.fn(),
  participantIsReferenced: vi.fn(),
  deleteParticipant: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import * as repo from "@/lib/events-repo";
import { POST } from "./route";
import { DELETE } from "./[pid]/route";

const EVENT_ID = "00000000-0000-4000-8000-0000000000e1";
const MATE_ID = "00000000-0000-4000-8000-0000000000a9";
const openEvent = { id: EVENT_ID, created_by: "u1", status: "open" };
const closedEvent = { ...openEvent, status: "closed" };
const ctx = { params: Promise.resolve({ id: EVENT_ID }) };
const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
  vi.mocked(repo.findMyParticipant).mockResolvedValue({ id: "p1" });
  vi.mocked(repo.addParticipant).mockResolvedValue({ id: "pN" } as never);
  vi.mocked(repo.getEvent).mockResolvedValue(openEvent as never);
});

describe("POST participants", () => {
  it("adds a by-name participant", async () => {
    expect((await POST(post({ display_name: " Can " }) as never, ctx)).status).toBe(201);
    expect(repo.addParticipant).toHaveBeenCalledWith({}, EVENT_ID, { display_name: "Can" });
  });

  it("adds a team mate by user id only when they share a team", async () => {
    vi.mocked(repo.shareATeam).mockResolvedValue(false);
    expect((await POST(post({ user_id: MATE_ID }) as never, ctx)).status).toBe(403);
    vi.mocked(repo.shareATeam).mockResolvedValue(true);
    expect((await POST(post({ user_id: MATE_ID }) as never, ctx)).status).toBe(201);
    expect(repo.addParticipant).toHaveBeenLastCalledWith({}, EVENT_ID, { user_id: MATE_ID });
  });

  it("400s a user id that is not a UUID", async () => {
    vi.mocked(repo.shareATeam).mockResolvedValue(true);
    expect((await POST(post({ user_id: "u9" }) as never, ctx)).status).toBe(400);
    expect(repo.shareATeam).not.toHaveBeenCalled();
    expect(repo.addParticipant).not.toHaveBeenCalled();
  });

  it("404s a non-UUID event id without a repo call", async () => {
    const res = await POST(post({ display_name: "Can" }) as never, { params: Promise.resolve({ id: "e1" }) });
    expect(res.status).toBe(404);
    expect(repo.findMyParticipant).not.toHaveBeenCalled();
    expect(repo.getEvent).not.toHaveBeenCalled();
    expect(repo.addParticipant).not.toHaveBeenCalled();
  });

  it("409s on a closed event", async () => {
    vi.mocked(repo.getEvent).mockResolvedValue(closedEvent as never);
    const res = await POST(post({ display_name: "Can" }) as never, ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Event is closed" });
    expect(repo.addParticipant).not.toHaveBeenCalled();
  });

  it("adds a registered user by email and 404s an unknown email", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(null);
    expect((await POST(post({ email: "x@y" }) as never, ctx)).status).toBe(404);
    vi.mocked(repo.findUserByEmail).mockResolvedValue({ id: "u7" });
    expect((await POST(post({ email: " x@y " }) as never, ctx)).status).toBe(201);
    expect(repo.findUserByEmail).toHaveBeenLastCalledWith({}, "x@y");
  });

  it("409s when the user is already in the event", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue({ id: "u7" });
    vi.mocked(repo.addParticipant).mockResolvedValue(null);
    expect((await POST(post({ email: "x@y" }) as never, ctx)).status).toBe(409);
  });

  it("400s on an empty body", async () => {
    expect((await POST(post({}) as never, ctx)).status).toBe(400);
  });
});

describe("DELETE participant", () => {
  const delCtx = { params: Promise.resolve({ id: EVENT_ID, pid: "p5" }) };
  const del = () => new Request("http://localhost/x", { method: "DELETE" });

  beforeEach(() => {
    vi.mocked(repo.listParticipants).mockResolvedValue([
      { id: "p1", user_id: "u1" },
      { id: "p5", user_id: null },
    ] as never);
    vi.mocked(repo.deleteParticipant).mockResolvedValue(true);
  });

  it("404s a participant of another event", async () => {
    vi.mocked(repo.listParticipants).mockResolvedValue([{ id: "p1", user_id: "u1" }] as never);
    expect((await DELETE(del() as never, delCtx)).status).toBe(404);
  });

  it("409s when the participant is in an expense or payment", async () => {
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(true);
    expect((await DELETE(del() as never, delCtx)).status).toBe(409);
    expect(repo.deleteParticipant).not.toHaveBeenCalled();
  });

  it("409s when the delete hits a foreign-key reference added after the check", async () => {
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(false);
    vi.mocked(repo.deleteParticipant).mockResolvedValue(false);
    const res = await DELETE(del() as never, delCtx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Participant has expenses or payments" });
  });

  it("refuses to remove the creator", async () => {
    const creatorCtx = { params: Promise.resolve({ id: EVENT_ID, pid: "p1" }) };
    expect((await DELETE(del() as never, creatorCtx)).status).toBe(409);
  });

  it("403s when a non-creator removes someone else", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u2", email: "b@x" });
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(false);
    expect((await DELETE(del() as never, delCtx)).status).toBe(403);
    expect(repo.deleteParticipant).not.toHaveBeenCalled();
  });

  it("lets a non-creator leave the event", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u2", email: "b@x" });
    vi.mocked(repo.listParticipants).mockResolvedValue([
      { id: "p1", user_id: "u1" },
      { id: "p5", user_id: "u2" },
    ] as never);
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(false);
    expect((await DELETE(del() as never, delCtx)).status).toBe(204);
    expect(repo.deleteParticipant).toHaveBeenCalledWith({}, "p5");
  });

  it("deletes an unreferenced participant", async () => {
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(false);
    expect((await DELETE(del() as never, delCtx)).status).toBe(204);
    expect(repo.deleteParticipant).toHaveBeenCalledWith({}, "p5");
    expect(repo.getEvent).toHaveBeenCalledTimes(1);
  });

  it("409s on a closed event", async () => {
    vi.mocked(repo.getEvent).mockResolvedValue(closedEvent as never);
    vi.mocked(repo.participantIsReferenced).mockResolvedValue(false);
    expect((await DELETE(del() as never, delCtx)).status).toBe(409);
    expect(repo.deleteParticipant).not.toHaveBeenCalled();
  });
});
