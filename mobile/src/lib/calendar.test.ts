import { describe, it, expect } from "vitest";
import {
  buildCalendarWeeks,
  formatMonthYear,
  formatDayShort,
  formatMonthName,
  formatDayLong,
  weekdayLabels,
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

describe("Turkish date formatters", () => {
  it("formatMonthYear renders the standalone Turkish month + year", () => {
    expect(formatMonthYear(2026, 6, "tr")).toBe("Temmuz 2026");
    expect(formatMonthYear(2026, 0, "tr")).toBe("Ocak 2026");
  });
  it("formatDayShort renders day + abbreviated Turkish month", () => {
    expect(formatDayShort(new Date(2026, 6, 5), "tr")).toBe("5 Tem");
    expect(formatDayShort(new Date(2026, 11, 20), "tr")).toBe("20 Ara");
  });
  it("formatMonthName renders the standalone Turkish month with no year", () => {
    expect(formatMonthName(0, "tr")).toBe("Ocak");
    expect(formatMonthName(7, "tr")).toBe("Ağustos");
  });
  it("formatMonthName is year-agnostic for the month picker's option list", () => {
    // The 0-indexed month is the only input; the internal reference year must not leak.
    const names = Array.from({ length: 12 }, (_, m) => formatMonthName(m, "tr"));
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    expect(names.some((n) => /\d/.test(n))).toBe(false);
  });
  it("formatDayLong renders day + full Turkish month + year", () => {
    expect(formatDayLong(new Date(2026, 7, 13), "tr")).toBe("13 Ağustos 2026");
    expect(formatDayLong(new Date(2026, 0, 1), "tr")).toBe("1 Ocak 2026");
  });
  it("formatDayLong does not zero-pad single-digit days", () => {
    expect(formatDayLong(new Date(2026, 11, 9), "tr")).toBe("9 Aralık 2026");
  });
});

describe("English date formatters", () => {
  it("switches month and day names with the language", () => {
    expect(formatMonthYear(2026, 6, "en")).toBe("July 2026");
    expect(formatDayShort(new Date(2026, 6, 5), "en")).toBe("5 Jul");
    expect(formatMonthName(7, "en")).toBe("August");
    expect(formatDayLong(new Date(2026, 7, 13), "en")).toBe("13 August 2026");
  });

  it("produces a different string from Turkish for the same date", () => {
    const date = new Date(2026, 11, 20);
    expect(formatDayShort(date, "en")).not.toBe(formatDayShort(date, "tr"));
  });
});

describe("weekdayLabels", () => {
  it("starts on Monday, matching the calendar grid", () => {
    expect(weekdayLabels("tr")[0]).toBe("Pzt");
    expect(weekdayLabels("en")[0]).toBe("Mon");
  });

  it("returns seven distinct labels per language", () => {
    for (const lang of ["tr", "en"] as const) {
      const labels = weekdayLabels(lang);
      expect(labels).toHaveLength(7);
      expect(new Set(labels).size).toBe(7);
    }
  });

  it("ends on Sunday", () => {
    expect(weekdayLabels("tr")[6]).toBe("Paz");
    expect(weekdayLabels("en")[6]).toBe("Sun");
  });
});
