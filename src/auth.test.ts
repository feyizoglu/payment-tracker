import { describe, it, expect, vi, beforeEach } from "vitest";

type Callbacks = {
  signIn(args: { user: { email?: string | null; name?: string | null; image?: string | null } }): Promise<boolean>;
  session(args: { session: { user?: { email?: string | null } } }): Promise<{ user?: { email?: string | null; id?: string } }>;
};

const captured = vi.hoisted(() => ({ callbacks: null as unknown, ops: [] as unknown[][] }));

vi.mock("next-auth", () => ({
  default: (config: { callbacks: unknown }) => {
    captured.callbacks = config.callbacks;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: () => ({}) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    const builder = {
      upsert: (payload: unknown, opts: unknown) => {
        captured.ops.push(["upsert", payload, opts]);
        return builder;
      },
      select: () => builder,
      eq: (column: string, value: unknown) => {
        captured.ops.push(["eq", column, value]);
        return builder;
      },
      single: () => Promise.resolve({ data: { id: "u1" }, error: null }),
    };
    return { from: () => builder };
  },
}));

import "./auth";

const callbacks = () => captured.callbacks as Callbacks;

beforeEach(() => {
  captured.ops.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("NextAuth callbacks", () => {
  it("upserts the user with a lowercased email", async () => {
    await callbacks().signIn({ user: { email: "Ann@Example.com", name: "Ann", image: null } });
    expect(captured.ops).toEqual([
      ["upsert", { email: "ann@example.com", name: "Ann", avatar_url: null }, { onConflict: "email" }],
    ]);
  });

  it("looks the session user up by the lowercased email", async () => {
    const session = await callbacks().session({ session: { user: { email: "Ann@Example.com" } } });
    expect(captured.ops).toEqual([["eq", "email", "ann@example.com"]]);
    expect(session.user?.id).toBe("u1");
  });
});
