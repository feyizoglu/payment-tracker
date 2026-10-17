import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/events-repo", () => ({
  listMyEventIds: vi.fn(),
  loadEventDetail: vi.fn(),
  createEvent: vi.fn(),
}));

import { getSessionUser } from "@/lib/session";
import { createEvent, listMyEventIds, loadEventDetail } from "@/lib/events-repo";
import { GET, POST } from "./route";

const post = (body: unknown) =>
  new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u1", email: "a@x" });
});

describe("GET /api/events", () => {
  it("401s without a session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/events") as never)).status).toBe(401);
  });

  it("returns my events with my per-currency balance", async () => {
    vi.mocked(listMyEventIds).mockResolvedValue(["e1"]);
    vi.mocked(loadEventDetail).mockResolvedValue({
      id: "e1", name: "Trip", event_date: null, created_by: "u1", status: "open", created_at: "2026-10-01",
      participants: [
        { id: "p1", event_id: "e1", user_id: "u1", display_name: null, created_at: "" },
        { id: "p2", event_id: "e1", user_id: null, display_name: "Can", created_at: "" },
      ],
      expenses: [{ id: "x", event_id: "e1", description: "d", amount_minor: 100, currency: "TRY", paid_by: "p1", spent_on: "", created_by: "u1", created_at: "", shares: [{ participant_id: "p1", amount_minor: 50 }, { participant_id: "p2", amount_minor: 50 }] }],
      settlements: [],
    });
    const body = await (await GET(new Request("http://localhost/api/events") as never)).json();
    expect(body).toEqual([expect.objectContaining({ id: "e1", my_balance: { TRY: 50 } })]);
    expect(body[0].participants).toBeUndefined();
  });
});

describe("GET /api/events edge cases", () => {
  const detail = (id: string, created_at: string, expenses: unknown[] = []) => ({
    id, name: id, event_date: null, created_by: "u1", status: "open", created_at,
    participants: [
      { id: "p1", event_id: id, user_id: "u1", display_name: null, created_at: "" },
      { id: "p2", event_id: id, user_id: null, display_name: "Can", created_at: "" },
    ],
    expenses,
    settlements: [],
  });
  const expense = (currency: string, paid_by: string) => ({
    id: `x-${currency}-${paid_by}`, event_id: "e1", description: "d", amount_minor: 100, currency, paid_by, spent_on: "", created_by: "u1", created_at: "",
    shares: [{ participant_id: "p1", amount_minor: 50 }, { participant_id: "p2", amount_minor: 50 }],
  });

  it("500s when listing my events fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(listMyEventIds).mockRejectedValue(new Error("db down"));
    const res = await GET(new Request("http://localhost/api/events") as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });

  it("lists the newest event first", async () => {
    vi.mocked(listMyEventIds).mockResolvedValue(["e1", "e2"]);
    vi.mocked(loadEventDetail).mockImplementation(async (_db, id) =>
      (id === "e1" ? detail("e1", "2026-10-01") : detail("e2", "2026-10-05")) as never
    );
    const body = await (await GET(new Request("http://localhost/api/events") as never)).json();
    expect(body.map((e: { created_at: string }) => e.created_at)).toEqual(["2026-10-05", "2026-10-01"]);
  });

  it("leaves out an event whose detail is gone", async () => {
    vi.mocked(listMyEventIds).mockResolvedValue(["e1", "e2"]);
    vi.mocked(loadEventDetail).mockImplementation(async (_db, id) => (id === "e1" ? null : detail("e2", "2026-10-05")) as never);
    const res = await GET(new Request("http://localhost/api/events") as never);
    expect(res.status).toBe(200);
    expect((await res.json()).map((e: { id: string }) => e.id)).toEqual(["e2"]);
  });

  it("leaves a currency that nets to zero out of my balance", async () => {
    vi.mocked(listMyEventIds).mockResolvedValue(["e1"]);
    vi.mocked(loadEventDetail).mockResolvedValue(
      detail("e1", "2026-10-01", [expense("TRY", "p1"), expense("TRY", "p2"), expense("EUR", "p1")]) as never
    );
    const body = await (await GET(new Request("http://localhost/api/events") as never)).json();
    expect(body[0].my_balance).toEqual({ EUR: 50 });
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
