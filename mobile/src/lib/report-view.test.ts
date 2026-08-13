import { describe, it, expect } from "vitest";
import { defaultRangeDates, defaultPayUntilDate } from "@/lib/report-view";

describe("defaultRangeDates", () => {
  it("spans today to the same day one month later", () => {
    expect(defaultRangeDates(new Date(2026, 7, 13))).toEqual({ start: "2026-08-13", end: "2026-09-13" });
  });

  it("rolls the year over in December", () => {
    expect(defaultRangeDates(new Date(2026, 11, 20))).toEqual({ start: "2026-12-20", end: "2027-01-20" });
  });

  it("overflows into the following month when the day does not exist", () => {
    // 31 Jan + 1 month has no 31 Feb; Date normalises it forward rather than clamping.
    expect(defaultRangeDates(new Date(2026, 0, 31)).end).toBe("2026-03-03");
  });
});

describe("defaultPayUntilDate", () => {
  it("lands on the last day of the current month", () => {
    expect(defaultPayUntilDate(new Date(2026, 7, 13))).toBe("2026-08-31");
    expect(defaultPayUntilDate(new Date(2026, 3, 1))).toBe("2026-04-30");
  });

  it("handles February in a non-leap year", () => {
    expect(defaultPayUntilDate(new Date(2026, 1, 10))).toBe("2026-02-28");
  });

  it("handles February in a leap year", () => {
    expect(defaultPayUntilDate(new Date(2028, 1, 10))).toBe("2028-02-29");
  });

  it("handles December without rolling the year", () => {
    expect(defaultPayUntilDate(new Date(2026, 11, 5))).toBe("2026-12-31");
  });
});
