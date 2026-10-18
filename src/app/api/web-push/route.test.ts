import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
// supabaseAdmin must never be called on the validation-failure paths below.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { DELETE, POST } from "./route";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";
const validBody = { endpoint: ENDPOINT, keys: { p256dh: "p-key", auth: "a-key" } };

const request = (method: string, body: unknown) =>
  new Request("http://localhost/api/web-push", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const signedIn = () =>
  vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/web-push", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await POST(request("POST", validBody) as never);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["a missing endpoint", { keys: validBody.keys }],
    ["an http endpoint", { ...validBody, endpoint: "http://push.example/abc" }],
    ["an endpoint that is not a URL", { ...validBody, endpoint: "not a url" }],
    ["a non push-service host", { ...validBody, endpoint: "https://internal.example/hook" }],
    ["a look-alike host", { ...validBody, endpoint: "https://fcm.googleapis.com.evil.example/x" }],
    ["a push host on another port", { ...validBody, endpoint: "https://fcm.googleapis.com:8443/x" }],
    ["missing keys", { endpoint: ENDPOINT }],
    ["an empty p256dh", { endpoint: ENDPOINT, keys: { p256dh: "", auth: "a-key" } }],
    ["an empty auth", { endpoint: ENDPOINT, keys: { p256dh: "p-key", auth: "" } }],
  ])("400s on %s", async (_label, body) => {
    signedIn();
    const res = await POST(request("POST", body) as never);
    expect(res.status).toBe(400);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it.each([
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QGx",
    "https://wns2-db5p.notify.windows.com/w/?token=abc",
  ])("accepts the push service endpoint %s", async (endpoint) => {
    signedIn();
    const db = { from: () => ({ upsert: async () => ({ error: null }) }) };
    vi.mocked(supabaseAdmin).mockReturnValue(db as never);
    const res = await POST(request("POST", { ...validBody, endpoint }) as never);
    expect(res.status).toBe(201);
  });

  it("upserts on endpoint so the row moves to the caller", async () => {
    signedIn();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);

    const res = await POST(request("POST", validBody) as never);

    expect(res.status).toBe(201);
    expect(from).toHaveBeenCalledWith("web_push_subscriptions");
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u-1", endpoint: ENDPOINT, p256dh: "p-key", auth: "a-key" },
      { onConflict: "endpoint" }
    );
  });

  it("500s with the database error message", async () => {
    signedIn();
    const upsert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    vi.mocked(supabaseAdmin).mockReturnValue({ from: () => ({ upsert }) } as never);

    const res = await POST(request("POST", validBody) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("DELETE /api/web-push", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await DELETE(request("DELETE", { endpoint: ENDPOINT }) as never);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("400s without an endpoint", async () => {
    signedIn();
    const res = await DELETE(request("DELETE", {}) as never);
    expect(res.status).toBe(400);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("deletes only the caller's row for that endpoint", async () => {
    signedIn();
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: del }));
    vi.mocked(supabaseAdmin).mockReturnValue({ from } as never);

    const res = await DELETE(request("DELETE", { endpoint: ENDPOINT }) as never);

    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("web_push_subscriptions");
    expect(eq1).toHaveBeenCalledWith("user_id", "u-1");
    expect(eq2).toHaveBeenCalledWith("endpoint", ENDPOINT);
  });

  it("500s with the database error message", async () => {
    signedIn();
    const eq2 = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: () => ({ delete: () => ({ eq: eq1 }) }),
    } as never);

    const res = await DELETE(request("DELETE", { endpoint: ENDPOINT }) as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
