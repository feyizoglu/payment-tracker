import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  loadMyEvents: vi.fn(),
  createEvent: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { createEvent, loadMyEvents } from "@/lib/events-repo";
import { GET, POST } from "./route";

const post = (body: unknown) =>
  new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
});

describe("GET /api/events", () => {
  const event = (id: string, created_at: string) => ({ id, name: id, event_date: null, created_by: "u1", status: "open" as const, created_at });
  const expense = (currency: string, paid_by: string) => ({
    id: `x-${currency}-${paid_by}`, event_id: "e1", description: "d", amount_minor: 100, currency, paid_by, spent_on: "", created_by: "u1", created_at: "",
    shares: [{ participant_id: "p1", amount_minor: 50 }, { participant_id: "p2", amount_minor: 50 }],
  });
  const row = (id: string, created_at: string, expenses: ReturnType<typeof expense>[] = []) => ({
    event: event(id, created_at), myParticipantId: "p1", expenses, settlements: [],
  });
  const get = async () => GET(new Request("http://localhost/api/events") as never);

  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(loadMyEvents).not.toHaveBeenCalled();
  });

  it("loads my events in one batched call and returns my per-currency balance", async () => {
    vi.mocked(loadMyEvents).mockResolvedValue([row("e1", "2026-10-01", [expense("TRY", "p1")])]);
    const body = await (await get()).json();
    expect(loadMyEvents).toHaveBeenCalledTimes(1);
    expect(loadMyEvents).toHaveBeenCalledWith({}, "u1");
    expect(body).toEqual([{ ...event("e1", "2026-10-01"), my_balance: { TRY: 50 } }]);
  });

  it("returns an empty list when I am in no event", async () => {
    vi.mocked(loadMyEvents).mockResolvedValue([]);
    expect(await (await get()).json()).toEqual([]);
  });

  it("uses my own participant id, not the first participant's", async () => {
    vi.mocked(loadMyEvents).mockResolvedValue([{ ...row("e1", "2026-10-01", [expense("TRY", "p1")]), myParticipantId: "p2" }]);
    expect((await (await get()).json())[0].my_balance).toEqual({ TRY: -50 });
  });

  it("500s when loading my events fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(loadMyEvents).mockRejectedValue(new Error("db down"));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });

  it("lists the newest event first", async () => {
    vi.mocked(loadMyEvents).mockResolvedValue([row("e1", "2026-10-01"), row("e2", "2026-10-05")]);
    const body = await (await get()).json();
    expect(body.map((e: { created_at: string }) => e.created_at)).toEqual(["2026-10-05", "2026-10-01"]);
  });

  it("leaves a currency that nets to zero out of my balance", async () => {
    vi.mocked(loadMyEvents).mockResolvedValue([
      row("e1", "2026-10-01", [expense("TRY", "p1"), expense("TRY", "p2"), expense("EUR", "p1")]),
    ]);
    expect((await (await get()).json())[0].my_balance).toEqual({ EUR: 50 });
  });
});

describe("POST /api/events", () => {
  it("400s on a blank name or a bad date", async () => {
    for (const b of [{ name: "  " }, { name: 5 }, { name: "Trip", event_date: "tomorrow" }]) {
      expect((await POST(post(b) as never)).status).toBe(400);
    }
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("creates the event with a trimmed name", async () => {
    vi.mocked(createEvent).mockResolvedValue({ id: "e1" } as never);
    const res = await POST(post({ name: " Trip ", event_date: "2026-10-16" }) as never);
    expect(res.status).toBe(201);
    expect(createEvent).toHaveBeenCalledWith({}, "u1", "Trip", "2026-10-16");
  });
});

describe("POST /api/events errors", () => {
  it("500s when creating the event fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createEvent).mockRejectedValue(new Error("db down"));
    const res = await POST(post({ name: "Trip" }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });
});
