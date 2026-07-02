import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { getSessionUser } from "./session";
import { signAppToken } from "./mobile-auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-32-chars-long!!";
});

const reqWith = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/test", { headers });

describe("getSessionUser", () => {
  it("returns user from a valid Bearer token", async () => {
    const token = await signAppToken({ userId: "u-1", email: "a@b.com" });
    const user = await getSessionUser(reqWith({ authorization: `Bearer ${token}` }));
    expect(user).toEqual({ id: "u-1", email: "a@b.com" });
  });

  it("returns null for an invalid Bearer token (no cookie fallback)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: "a@b.com", id: "u-1" },
    } as never);
    const user = await getSessionUser(reqWith({ authorization: "Bearer bogus" }));
    expect(user).toBeNull();
  });

  it("falls back to NextAuth session when no Bearer header", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: "a@b.com", id: "u-1" },
    } as never);
    const user = await getSessionUser(reqWith());
    expect(user).toEqual({ id: "u-1", email: "a@b.com" });
  });

  it("returns null when session lacks id or email", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@b.com" } } as never);
    expect(await getSessionUser(reqWith())).toBeNull();
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await getSessionUser(reqWith())).toBeNull();
  });

  it("treats a lowercase 'bearer' scheme as no Bearer header (cookie path)", async () => {
    // The scheme match is case-sensitive by design; a lowercase scheme must
    // fall through to the cookie session rather than be parsed as a token.
    vi.mocked(auth).mockResolvedValue({
      user: { email: "a@b.com", id: "u-1" },
    } as never);
    const token = await signAppToken({ userId: "u-1", email: "a@b.com" });
    const user = await getSessionUser(reqWith({ authorization: `bearer ${token}` }));
    expect(user).toEqual({ id: "u-1", email: "a@b.com" });
  });
});
