import { describe, it, expect } from "vitest";
import {
  toIsoDate,
  fromIsoDate,
  toIsoMonth,
  parseIsoMonth,
  dayOfIsoDate,
  monthPickerYears,
  withMonthPickerYear,
  withMonthPickerMonth,
} from "@/lib/dates";

describe("toIsoDate", () => {
  it("pads month and day and stays on the local day", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("does not shift across the UTC boundary", () => {
    // Late-evening local time is already the next day in UTC.
    expect(toIsoDate(new Date(2026, 7, 13, 23, 30))).toBe("2026-08-13");
  });
});

describe("fromIsoDate", () => {
  it("parses to local midnight", () => {
    const d = fromIsoDate("2026-08-13");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 13]);
    expect(d.getHours()).toBe(0);
  });

  it("round-trips through toIsoDate", () => {
    expect(toIsoDate(fromIsoDate("2026-02-29"))).toBe("2026-03-01"); // 2026 is not a leap year
    expect(toIsoDate(fromIsoDate("2026-03-09"))).toBe("2026-03-09");
  });

  it("falls back to today when malformed", () => {
    expect(toIsoDate(fromIsoDate(""))).toBe(toIsoDate(new Date()));
    expect(toIsoDate(fromIsoDate("13/08/2026"))).toBe(toIsoDate(new Date()));
  });
});

describe("toIsoMonth / parseIsoMonth", () => {
  it("formats and parses", () => {
    expect(toIsoMonth(new Date(2026, 8, 20))).toBe("2026-09");
    expect(parseIsoMonth("2026-09")).toEqual({ year: 2026, month: 9 });
  });

  it("rejects empty and out-of-range values", () => {
    expect(parseIsoMonth("")).toBeNull();
    expect(parseIsoMonth("2026-13")).toBeNull();
    expect(parseIsoMonth("2026-9")).toBeNull();
  });
});

describe("monthPickerYears", () => {
  const today = new Date(2026, 7, 13);

  it("starts at the current year when nothing is selected", () => {
    expect(monthPickerYears("", today, 3)).toEqual([2026, 2027, 2028, 2029]);
  });

  it("reaches back to an already stored past year", () => {
    expect(monthPickerYears("2024-05", today, 1)).toEqual([2024, 2025, 2026, 2027]);
  });

  it("extends past an already stored future year", () => {
    expect(monthPickerYears("2030-05", today, 2)).toEqual([
      2026, 2027, 2028, 2029, 2030, 2031, 2032,
    ]);
  });

  it("always offers at least the current year", () => {
    expect(monthPickerYears("", today, 0)).toEqual([2026]);
  });
});

describe("withMonthPickerYear / withMonthPickerMonth", () => {
  const today = new Date(2026, 7, 13); // August

  it("fills the missing month from today when nothing was selected", () => {
    expect(withMonthPickerYear("", "2027", today)).toBe("2027-08");
  });

  it("keeps the selected month when changing the year", () => {
    expect(withMonthPickerYear("2026-03", "2028", today)).toBe("2028-03");
  });

  it("fills the missing year from today when nothing was selected", () => {
    expect(withMonthPickerMonth("", "11", today)).toBe("2026-11");
  });

  it("keeps the selected year when changing the month", () => {
    expect(withMonthPickerMonth("2029-03", "12", today)).toBe("2029-12");
  });

  it("produces a value parseIsoMonth accepts", () => {
    expect(parseIsoMonth(withMonthPickerYear("", "2027", today))).toEqual({ year: 2027, month: 8 });
  });
});

describe("dayOfIsoDate", () => {
  it("reads the day-of-month", () => {
    expect(dayOfIsoDate("2026-08-13")).toBe(13);
    expect(dayOfIsoDate("2026-08-01")).toBe(1);
  });
});
