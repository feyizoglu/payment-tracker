import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mobile-auth", () => ({
  verifyGoogleIdToken: vi.fn(),
  signAppToken: vi.fn(),
}));
// supabaseAdmin must never be called on the validation-failure paths below.
vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));

import { verifyGoogleIdToken } from "@/lib/mobile-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { POST } from "./route";

const post = (body: unknown) =>
  new Request("http://localhost/api/auth/mobile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/mobile validation", () => {
  it("400s when id_token is missing", async () => {
    const res = await POST(post({}) as never);
    expect(res.status).toBe(400);
    expect(verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("401s when the Google token is invalid", async () => {
    vi.mocked(verifyGoogleIdToken).mockResolvedValue(null);
    const res = await POST(post({ id_token: "bad" }) as never);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
  });
});
