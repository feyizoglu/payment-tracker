import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { enUS, tr } from "date-fns/locale";
import type { Lang } from "@ptracker/shared/i18n";

// Builds the Monday-first calendar grid (weeks of 7 days) that fully covers the
// given month, including the leading/trailing days from adjacent months. month
// is 0-indexed.
export function buildCalendarWeeks(year: number, month: number): Date[][] {
  const monthStart = startOfMonth(new Date(year, month, 1));
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

// Month and day labels follow the selected language. date-fns owns the names, rather
// than hand-rolled arrays, so the two languages cannot drift apart or miss a case.
function localeOf(lang: Lang) {
  return lang === "tr" ? tr : enUS;
}

// month is 0-indexed.
export function formatMonthYear(year: number, month: number, lang: Lang): string {
  return format(new Date(year, month, 1), "LLLL yyyy", { locale: localeOf(lang) });
}

export function formatDayShort(date: Date, lang: Lang): string {
  return format(date, "d LLL", { locale: localeOf(lang) });
}

// Full month name on its own, for the month picker's option list. month is 0-indexed.
export function formatMonthName(month: number, lang: Lang): string {
  return format(new Date(2000, month, 1), "LLLL", { locale: localeOf(lang) });
}

// Long day label for the date field's closed state, e.g. "13 Ağustos 2026".
export function formatDayLong(date: Date, lang: Lang): string {
  return format(date, "d LLLL yyyy", { locale: localeOf(lang) });
}

// Monday-first short weekday headers for the calendar grid, in the selected language.
// 2024-01-01 was a Monday, so the week starting there gives the labels in grid order.
export function weekdayLabels(lang: Lang): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    format(new Date(2024, 0, 1 + i), "EEE", { locale: localeOf(lang) })
  );
}
