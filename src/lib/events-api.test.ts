import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({ findMyParticipant: vi.fn(), getEvent: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { findMyParticipant, getEvent } from "@/lib/events-repo";
import { withParticipant, parseAmountMinor, isCurrency } from "./events-api";

const EVENT_ID = "00000000-0000-4000-8000-0000000000e1";
const req = new Request(`http://localhost/api/events/${EVENT_ID}`);
const openEvent = { id: EVENT_ID, created_by: "u1", status: "open" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEvent).mockResolvedValue(openEvent as never);
});

describe("withParticipant", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await withParticipant(req, EVENT_ID, async () => new Response("ok"));
    expect(res.status).toBe(401);
  });

  it("404s when the user is not in the event", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(findMyParticipant).mockResolvedValue(null);
    const res = await withParticipant(req, EVENT_ID, async () => new Response("ok"));
    expect(res.status).toBe(404);
  });

  it("runs the handler with the user and their participant", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(findMyParticipant).mockResolvedValue({ id: "p1" });
    const handler = vi.fn(async () => new Response("ok"));
    await withParticipant(req, EVENT_ID, handler);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: "u1", email: "a@x" }, me: { id: "p1" }, event: openEvent })
    );
  });

  it("404s a non-UUID event id without touching the database", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    const handler = vi.fn(async () => new Response("ok"));
    const res = await withParticipant(req, "e1", handler);
    expect(res.status).toBe(404);
    expect(findMyParticipant).not.toHaveBeenCalled();
    expect(getEvent).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("404s when the event row is gone", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(findMyParticipant).mockResolvedValue({ id: "p1" });
    vi.mocked(getEvent).mockResolvedValue(null);
    const handler = vi.fn(async () => new Response("ok"));
    expect((await withParticipant(req, EVENT_ID, handler)).status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("turns a thrown error into a 500", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
    vi.mocked(findMyParticipant).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await withParticipant(req, EVENT_ID, async () => new Response("ok"));
    expect(res.status).toBe(500);
  });
});

describe("validators", () => {
  it("accepts positive integer minor amounts only", () => {
    expect(parseAmountMinor(1)).toBe(1);
    for (const bad of [0, -1, 1.5, "100", null, Number.MAX_SAFE_INTEGER + 1]) expect(parseAmountMinor(bad)).toBeNull();
  });

  it("accepts the four app currencies", () => {
    expect(isCurrency("EUR")).toBe(true);
    expect(isCurrency("JPY")).toBe(false);
  });
});
