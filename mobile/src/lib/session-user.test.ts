import { describe, it, expect, vi, beforeEach } from "vitest";

const token = vi.hoisted(() => ({ value: null as string | null, fail: false }));
vi.mock("./storage", () => ({
  getToken: async () => {
    if (token.fail) throw new Error("keystore");
    return token.value;
  },
}));
import { sessionUserId } from "./session-user";

const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: unknown) => `${part({ alg: "HS256" })}.${part(payload)}.signature`;

beforeEach(() => {
  token.value = null;
  token.fail = false;
});

describe("sessionUserId", () => {
  it("reads the account from the stored token's subject, without the network", async () => {
    token.value = jwt({ sub: "3f2c9a1e-7b44-4c1d-9e0f-1a2b3c4d5e6f", email: "çağla@örnek.com", iss: "payment-tracker" });
    expect(await sessionUserId()).toBe("3f2c9a1e-7b44-4c1d-9e0f-1a2b3c4d5e6f");
  });

  it("knows no account without a token, or with a token it cannot read", async () => {
    expect(await sessionUserId()).toBeNull();
    for (const value of ["", "abc", "a.b.c", jwt({ email: "x@y.z" }), jwt({ sub: "" }), jwt({ sub: 5 }), `x.${part("text")}.y`]) {
      token.value = value;
      expect(await sessionUserId()).toBeNull();
    }
  });

  it("knows no account when the secure store cannot be read", async () => {
    token.fail = true;
    expect(await sessionUserId()).toBeNull();
  });
});
