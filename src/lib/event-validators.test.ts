import { describe, it, expect } from "vitest";
import { isIsoDate, isUuid } from "./event-validators";

describe("isUuid", () => {
  it("accepts canonical UUIDs in either case", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of [
      "e1",
      "",
      "123e4567e89b12d3a456426614174000",
      "123e4567-e89b-12d3-a456-42661417400",
      "123e4567-e89b-12d3-a456-4266141740000",
      "g23e4567-e89b-12d3-a456-426614174000",
      " 123e4567-e89b-12d3-a456-426614174000",
      "123e4567-e89b-12d3-a456-426614174000\n",
      null,
      undefined,
      42,
    ]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    expect(isIsoDate("2026-10-16")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("rejects non-existent dates and other shapes", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-10-16T00:00:00Z")).toBe(false);
    expect(isIsoDate(20261016)).toBe(false);
  });
});
