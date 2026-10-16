import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  findMyParticipant: vi.fn(),
  loadEventDetail: vi.fn(),
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { deleteEvent, findMyParticipant, getEvent, loadEventDetail, updateEvent } from "@/lib/events-repo";
import { DELETE, GET, PATCH } from "./route";

const EVENT_ID = "00000000-0000-4000-8000-0000000000e1";
const ctx = { params: Promise.resolve({ id: EVENT_ID }) };
const patch = (body: unknown) => new Request(`http://localhost/api/events/${EVENT_ID}`, { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u2", email: "b@x" });
  vi.mocked(findMyParticipant).mockResolvedValue({ id: "p2" });
  vi.mocked(getEvent).mockResolvedValue({ id: EVENT_ID, created_by: "u1", status: "open" } as never);
});

describe("PATCH /api/events/[id]", () => {
  it("403s for a participant who did not create the event", async () => {
    expect((await PATCH(patch({ status: "closed" }) as never, ctx)).status).toBe(403);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("lets the creator close the event", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await PATCH(patch({ status: "closed" }) as never, ctx)).status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith({}, EVENT_ID, { status: "closed" });
    expect(getEvent).toHaveBeenCalledTimes(1);
  });

  it("lets the creator reopen a closed event", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(getEvent).mockResolvedValue({ id: EVENT_ID, created_by: "u1", status: "closed" } as never);
    expect((await PATCH(patch({ status: "open" }) as never, ctx)).status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith({}, EVENT_ID, { status: "open" });
  });

  it("400s when no known field is sent", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await PATCH(patch({ colour: "red" }) as never, ctx)).status).toBe(400);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("400s on an invalid status or blank name", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await PATCH(patch({ status: "done" }) as never, ctx)).status).toBe(400);
    expect((await PATCH(patch({ name: " " }) as never, ctx)).status).toBe(400);
  });
});

describe("GET /api/events/[id]", () => {
  const get = () => new Request(`http://localhost/api/events/${EVENT_ID}`);

  it("404s when the detail is gone", async () => {
    vi.mocked(loadEventDetail).mockResolvedValue(null);
    const res = await GET(get() as never, ctx);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns the detail with 200", async () => {
    const detail = { id: EVENT_ID, name: "Trip", participants: [], expenses: [], settlements: [] };
    vi.mocked(loadEventDetail).mockResolvedValue(detail as never);
    const res = await GET(get() as never, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(detail);
    expect(loadEventDetail).toHaveBeenCalledWith({}, EVENT_ID, { id: EVENT_ID, created_by: "u1", status: "open" });
    expect(getEvent).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/events/[id] body fields", () => {
  beforeEach(() => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
  });

  it("400s a JSON array body without updating", async () => {
    const res = await PATCH(patch([]) as never, ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid body" });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("400s a body that is not JSON without updating", async () => {
    const bad = new Request(`http://localhost/api/events/${EVENT_ID}`, { method: "PATCH", body: "{not json" });
    const res = await PATCH(bad as never, ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid body" });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("400s an impossible calendar date", async () => {
    const res = await PATCH(patch({ event_date: "2026-02-30" }) as never, ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid date" });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("updates the event date", async () => {
    expect((await PATCH(patch({ event_date: "2026-11-01" }) as never, ctx)).status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith({}, EVENT_ID, { event_date: "2026-11-01" });
  });

  it("clears the event date with null", async () => {
    expect((await PATCH(patch({ event_date: null }) as never, ctx)).status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith({}, EVENT_ID, { event_date: null });
  });

  it("stores a trimmed name", async () => {
    expect((await PATCH(patch({ name: " Party " }) as never, ctx)).status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith({}, EVENT_ID, { name: "Party" });
  });
});

describe("DELETE /api/events/[id]", () => {
  it("403s for a non-creator and deletes for the creator", async () => {
    const del = () => new Request(`http://localhost/api/events/${EVENT_ID}`, { method: "DELETE" });
    expect((await DELETE(del() as never, ctx)).status).toBe(403);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await DELETE(del() as never, ctx)).status).toBe(204);
    expect(deleteEvent).toHaveBeenCalledWith({}, EVENT_ID);
  });
});
