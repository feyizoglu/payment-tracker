import { describe, it, expect } from "vitest";
import {
  buildCalendarWeeks,
  formatMonthYear,
  formatDayShort,
  formatMonthName,
  formatDayLong,
} from "./calendar";

describe("buildCalendarWeeks", () => {
  it("returns Monday-first weeks of 7 days covering the whole month", () => {
    // July 2026: 1st is a Wednesday; month has 31 days.
    const weeks = buildCalendarWeeks(2026, 6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const flat = weeks.flat();
    // First cell is a Monday (getDay() === 1) on/before Jul 1.
    expect(flat[0].getDay()).toBe(1);
    // Grid contains every day of July.
    const julyDays = flat.filter((d) => d.getMonth() === 6).map((d) => d.getDate());
    expect(julyDays[0]).toBe(1);
    expect(julyDays[julyDays.length - 1]).toBe(31);
  });
});

describe("Turkish date formatters (date-fns tr locale)", () => {
  it("formatMonthYear renders the standalone Turkish month + year", () => {
    expect(formatMonthYear(2026, 6)).toBe("Temmuz 2026");
    expect(formatMonthYear(2026, 0)).toBe("Ocak 2026");
  });
  it("formatDayShort renders day + abbreviated Turkish month", () => {
    expect(formatDayShort(new Date(2026, 6, 5))).toBe("5 Tem");
    expect(formatDayShort(new Date(2026, 11, 20))).toBe("20 Ara");
  });
  it("formatMonthName renders the standalone Turkish month with no year", () => {
    expect(formatMonthName(0)).toBe("Ocak");
    expect(formatMonthName(7)).toBe("Ağustos");
  });
  it("formatMonthName is year-agnostic for the month picker's option list", () => {
    // The 0-indexed month is the only input; the internal reference year must not leak.
    const names = Array.from({ length: 12 }, (_, m) => formatMonthName(m));
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    expect(names.some((n) => /\d/.test(n))).toBe(false);
  });
  it("formatDayLong renders day + full Turkish month + year", () => {
    expect(formatDayLong(new Date(2026, 7, 13))).toBe("13 Ağustos 2026");
    expect(formatDayLong(new Date(2026, 0, 1))).toBe("1 Ocak 2026");
  });
  it("formatDayLong does not zero-pad single-digit days", () => {
    expect(formatDayLong(new Date(2026, 11, 9))).toBe("9 Aralık 2026");
  });
});
