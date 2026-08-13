import { describe, it, expect } from "vitest";
import { parseLang } from "@/lib/language-storage";

describe("parseLang", () => {
  it("accepts the two supported languages", () => {
    expect(parseLang("tr")).toBe("tr");
    expect(parseLang("en")).toBe("en");
  });

  it("rejects anything else so a bad value cannot reach the dictionary", () => {
    // A stored "de" would index translations["de"] and render undefined everywhere.
    expect(parseLang("de")).toBeNull();
    expect(parseLang("")).toBeNull();
    expect(parseLang("TR")).toBeNull();
    expect(parseLang(null)).toBeNull();
  });
});
