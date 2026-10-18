import { describe, it, expect } from "vitest";
import { parseMonthParam } from "./month-param";

describe("parseMonthParam", () => {
  it("returns the first day of a yyyy-MM month in local time", () => {
    const d = parseMonthParam("2026-11");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(10);
    expect(d?.getDate()).toBe(1);
  });

  it.each([null, "", "2026-13", "2026-00", "2026-1", "26-11", "2026-11-05", "abcd-ef"])(
    "returns null for %s",
    (value) => {
      expect(parseMonthParam(value)).toBeNull();
    }
  );
});
