import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
// supabaseAdmin must never be called on the validation-failure paths below.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));

import { getSessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";
import { POST } from "./route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/devices", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/devices validation", () => {
  it("401s when unauthenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await POST(post({ expo_push_token: "ExponentPushToken[x]" }) as never);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("400s when expo_push_token has the wrong prefix", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const res = await POST(post({ expo_push_token: "fcm-token" }) as never);
    expect(res.status).toBe(400);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });

  it("400s on an unsupported platform", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u-1", email: "a@b.com" });
    const res = await POST(
      post({ expo_push_token: "ExponentPushToken[x]", platform: "windows" }) as never
    );
    expect(res.status).toBe(400);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });
});
