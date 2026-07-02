import { describe, it, expect, beforeAll, vi } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { signAppToken, verifyAppToken, verifyGoogleIdToken } from "./mobile-auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-32-chars-long!!";
  process.env.GOOGLE_MOBILE_CLIENT_IDS = "mobile-client-a, mobile-client-b";
});

describe("app token", () => {
  it("signs and verifies a round-trip token", async () => {
    const token = await signAppToken({ userId: "user-123", email: "a@b.com" });
    const payload = await verifyAppToken(token);
    expect(payload).toEqual({ userId: "user-123", email: "a@b.com" });
  });

  it("rejects a tampered token", async () => {
    const token = await signAppToken({ userId: "user-123", email: "a@b.com" });
    const tampered = token.slice(0, -2) + "xx";
    expect(await verifyAppToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifyAppToken("not-a-jwt")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await new SignJWT({ email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setIssuer("payment-tracker-mobile")
      .setExpirationTime("-1s")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    expect(await verifyAppToken(token)).toBeNull();
  });

  it("rejects a token with the wrong issuer", async () => {
    const token = await new SignJWT({ email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setIssuer("some-other-issuer")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    expect(await verifyAppToken(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await new SignJWT({ email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setIssuer("payment-tracker-mobile")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("another-secret-that-is-32-chars-xx"));
    expect(await verifyAppToken(token)).toBeNull();
  });

  it("throws a clear error when AUTH_SECRET is too short", async () => {
    const original = process.env.AUTH_SECRET;
    try {
      process.env.AUTH_SECRET = "short-secret";
      await expect(
        signAppToken({ userId: "user-123", email: "a@b.com" })
      ).rejects.toThrow("AUTH_SECRET must be at least 32 characters");
    } finally {
      process.env.AUTH_SECRET = original;
    }
  });

  it("rejects a correctly signed token whose claims have the wrong shape", async () => {
    // Signed with the right secret and issuer, but email is a number and sub is missing.
    const token = await new SignJWT({ email: 42 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("payment-tracker-mobile")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
    expect(await verifyAppToken(token)).toBeNull();
  });

  it("throws a clear error when AUTH_SECRET is missing", async () => {
    const original = process.env.AUTH_SECRET;
    try {
      delete process.env.AUTH_SECRET;
      await expect(
        signAppToken({ userId: "user-123", email: "a@b.com" })
      ).rejects.toThrow("AUTH_SECRET must be at least 32 characters");
    } finally {
      process.env.AUTH_SECRET = original;
    }
  });
});

describe("verifyGoogleIdToken", () => {
  async function makeGoogleStyleToken(
    over: { issuer?: string; audience?: string } = {}
  ) {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({
      email: "user@gmail.com",
      name: "Test User",
      picture: "https://example.com/p.jpg",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("google-sub-1")
      .setIssuer(over.issuer ?? "https://accounts.google.com")
      .setAudience(over.audience ?? "mobile-client-b") // -b: its allowlist entry has a leading space, so this also exercises trim
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
    // jwtVerify's injectable second parameter is the getKey-function overload,
    // so the local public key is passed via a trivial resolver.
    return { token, getKey: async () => publicKey };
  }

  it("rejects malformed input without throwing", async () => {
    expect(await verifyGoogleIdToken("not-a-jwt")).toBeNull();
  });

  it("accepts a token with allowed issuer and audience and returns the profile", async () => {
    const { token, getKey } = await makeGoogleStyleToken();
    expect(await verifyGoogleIdToken(token, getKey)).toEqual({
      email: "user@gmail.com",
      name: "Test User",
      picture: "https://example.com/p.jpg",
    });
  });

  it("rejects a token whose audience is not allowlisted", async () => {
    const { token, getKey } = await makeGoogleStyleToken({
      audience: "some-unknown-client",
    });
    expect(await verifyGoogleIdToken(token, getKey)).toBeNull();
  });

  it("rejects a token with the wrong issuer", async () => {
    const { token, getKey } = await makeGoogleStyleToken({
      issuer: "https://evil.example.com",
    });
    expect(await verifyGoogleIdToken(token, getKey)).toBeNull();
  });

  it("rejects a valid token without an email claim", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ name: "No Email" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience("mobile-client-b")
      .setExpirationTime("1h")
      .sign(privateKey);
    expect(await verifyGoogleIdToken(token, async () => publicKey)).toBeNull();
  });

  it("logs a loud configuration error when no audiences are configured", async () => {
    const originalAuthId = process.env.AUTH_GOOGLE_ID;
    const originalMobileIds = process.env.GOOGLE_MOBILE_CLIENT_IDS;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      delete process.env.AUTH_GOOGLE_ID;
      delete process.env.GOOGLE_MOBILE_CLIENT_IDS;
      const { token, getKey } = await makeGoogleStyleToken();
      expect(await verifyGoogleIdToken(token, getKey)).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        "verifyGoogleIdToken unexpected error:",
        expect.objectContaining({
          message: expect.stringContaining("No Google audiences configured"),
        })
      );
    } finally {
      if (originalAuthId !== undefined) process.env.AUTH_GOOGLE_ID = originalAuthId;
      if (originalMobileIds !== undefined) process.env.GOOGLE_MOBILE_CLIENT_IDS = originalMobileIds;
      errorSpy.mockRestore();
    }
  });

  it("returns null name and picture when those claims are absent", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "user@gmail.com" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience("mobile-client-b")
      .setExpirationTime("1h")
      .sign(privateKey);
    expect(await verifyGoogleIdToken(token, async () => publicKey)).toEqual({
      email: "user@gmail.com",
      name: null,
      picture: null,
    });
  });
});
