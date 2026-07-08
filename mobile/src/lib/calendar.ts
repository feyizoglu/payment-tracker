import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { tr } from "date-fns/locale";

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

// Turkish month/day labels via the date-fns `tr` locale — the single source of
// truth the web app already uses (src/components/CalendarView.tsx), rather than
// hand-rolled month-name arrays. month is 0-indexed.
export function formatMonthYear(year: number, month: number): string {
  return format(new Date(year, month, 1), "LLLL yyyy", { locale: tr });
}

export function formatDayShort(date: Date): string {
  return format(date, "d LLL", { locale: tr });
}
