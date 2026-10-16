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
