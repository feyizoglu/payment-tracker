import { describe, it, expect, vi } from "vitest";
import { exchangeGoogleIdToken, fetchProfile } from "./auth";

describe("exchangeGoogleIdToken", () => {
  it("posts the id_token and returns token + user", async () => {
    const post = vi.fn().mockResolvedValue({
      token: "app-jwt",
      user: { id: "u1", email: "a@b.com", name: "A", avatar_url: null },
    });
    const result = await exchangeGoogleIdToken(post, "google-id-token");
    expect(post).toHaveBeenCalledWith("/api/auth/mobile", { id_token: "google-id-token" });
    expect(result).toEqual({
      token: "app-jwt",
      user: { id: "u1", email: "a@b.com", name: "A", avatar_url: null },
    });
  });

  it("throws before calling the API when the id token is empty", async () => {
    const post = vi.fn();
    await expect(exchangeGoogleIdToken(post, "")).rejects.toThrow("Google ID token");
    expect(post).not.toHaveBeenCalled();
  });
});

describe("fetchProfile", () => {
  it("gets the caller's profile from /api/users/me", async () => {
    const get = vi.fn().mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      avatar_url: null,
      color: "#ff0000",
    });

    const user = await fetchProfile(get);

    expect(get).toHaveBeenCalledWith("/api/users/me");
    expect(user).toEqual({
      id: "u1",
      email: "a@b.com",
      name: "A",
      avatar_url: null,
      color: "#ff0000",
    });
  });

  it("propagates the API error so the caller decides whether to sign out", async () => {
    const get = vi.fn().mockRejectedValue(new Error("unauthorized"));
    await expect(fetchProfile(get)).rejects.toThrow("unauthorized");
  });
});
