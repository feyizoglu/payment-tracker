import { describe, it, expect } from "vitest";
import { isEconomyPath } from "./economy-path";

describe("isEconomyPath", () => {
  it("is true for the Economy tab and its own modals", () => {
    expect(isEconomyPath("/economy")).toBe(true);
    expect(isEconomyPath("/asset-form")).toBe(true);
    expect(isEconomyPath("/asset/abc123")).toBe(true);
    expect(isEconomyPath("/manual-gold")).toBe(true);
  });

  it("is false everywhere else", () => {
    for (const path of ["/", "/events", "/settings", "/games", "/app-lock", "/sign-in", "/payment-form", "/event/abc"]) {
      expect(isEconomyPath(path)).toBe(false);
    }
  });

  it("does not match paths that only look like Economy ones", () => {
    for (const path of ["/asset", "/asset/", "/asset/abc/edit", "/economy-x", "/economy/abc", "/asset-forms", "/x/economy", ""]) {
      expect(isEconomyPath(path)).toBe(false);
    }
  });
});
