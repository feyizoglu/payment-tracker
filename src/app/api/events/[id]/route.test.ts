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
import { deleteEvent, findMyParticipant, getEvent, updateEvent } from "@/lib/events-repo";
import { DELETE, PATCH } from "./route";

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

describe("DELETE /api/events/[id]", () => {
  it("403s for a non-creator and deletes for the creator", async () => {
    const del = () => new Request(`http://localhost/api/events/${EVENT_ID}`, { method: "DELETE" });
    expect((await DELETE(del() as never, ctx)).status).toBe(403);
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    expect((await DELETE(del() as never, ctx)).status).toBe(204);
    expect(deleteEvent).toHaveBeenCalledWith({}, EVENT_ID);
  });
});
