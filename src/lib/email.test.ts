import { describe, it, expect } from "vitest";
import { normalizeEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("trims and lowercases, as users.email is stored", () => {
    expect(normalizeEmail("  Ali@Gmail.COM ")).toBe("ali@gmail.com");
    expect(normalizeEmail("ann@example.com")).toBe("ann@example.com");
  });
});
