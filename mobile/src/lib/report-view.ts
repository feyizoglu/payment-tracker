import { toIsoDate } from "@/lib/dates";

// View state for the Reports tab: which report is showing and the default dates each
// one opens on. Pure so the defaults are testable — they are the kind of off-by-one
// (last day of month, one month ahead) that is easy to get wrong and invisible in tsc.

export type ReportKind = "range" | "payUntil";

// The date-range report opens on today → one month ahead, matching the web modal.
export function defaultRangeDates(today: Date): { start: string; end: string } {
  const end = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return { start: toIsoDate(today), end: toIsoDate(end) };
}

// "Pay until" opens on the last day of the current month — day 0 of next month.
export function defaultPayUntilDate(today: Date): string {
  return toIsoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
}
