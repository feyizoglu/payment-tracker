import type { Occurrence } from "@ptracker/shared/types";

export { markPaidRequest, type MarkPaidRequest } from "@ptracker/shared/mark-paid";

// A stable React key — unique across a payment's installment lines, a recurring
// payment's periods, and multi-currency lines that share a due date.
export function occurrenceKey(o: Occurrence): string {
  return `${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}-${o.currency}`;
}

// Short type badge: the caller's "monthly" label for a recurring reminder, else the
// 1-indexed installment position "N/M" (e.g. index 2 of 12 -> "3/12"). The label is a
// parameter because this is a pure function — it cannot read the dictionary itself.
export function occurrenceTypeBadge(o: Occurrence, monthlyLabel: string): string {
  if (o.kind === "recurring") return monthlyLabel;
  return `${(o.installmentIndex ?? 0) + 1}/${o.totalInstallments ?? "?"}`;
}

// Canonical per-day bucket key (local time). Single source of truth so the
// calendar view and groupOccurrencesByDay can't drift apart.
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export interface DayGroup {
  key: string;
  date: Date;
  items: Occurrence[];
}

// Groups occurrences by calendar day (local time), ascending by date. Input
// order within a day is preserved (getOccurrencesForMonth already sorts).
export function groupOccurrencesByDay(occurrences: Occurrence[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const o of occurrences) {
    const d = o.dueDate;
    const key = dayKey(d);
    let group = map.get(key);
    if (!group) {
      group = { key, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      map.set(key, group);
    }
    group.items.push(o);
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
