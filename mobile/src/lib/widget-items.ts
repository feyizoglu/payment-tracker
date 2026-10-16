import { addDays, startOfDay } from "date-fns";
import type { Occurrence } from "@ptracker/shared/types";
import { toIsoDate } from "./dates";
import { occurrenceKey } from "./occurrences";

export const WIDGET_MAX_ROWS = 4;
const WINDOW_DAYS = 7;

// Plain JSON so it survives the AsyncStorage cache; dueDate is "yyyy-MM-dd".
export interface WidgetItem {
  key: string;
  name: string;
  dueDate: string;
  amount: number | null;
  currency: string;
  userId: string;
  overdue: boolean;
}

export function selectWidgetItems(
  occurrences: Occurrence[],
  now: Date
): { items: WidgetItem[]; moreCount: number } {
  const today = startOfDay(now);
  const windowEnd = addDays(today, WINDOW_DAYS + 1);
  const due = occurrences
    .filter((o) => !o.isPaid && o.dueDate < windowEnd)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((o) => {
      const dueDate = toIsoDate(o.dueDate);
      return {
        key: occurrenceKey(o),
        name: o.name,
        dueDate,
        amount: o.amount,
        currency: o.currency,
        userId: o.user_id,
        overdue: o.dueDate < today,
      };
    });
  return { items: due.slice(0, WIDGET_MAX_ROWS), moreCount: Math.max(0, due.length - WIDGET_MAX_ROWS) };
}

export function widgetMonthUri(dueDate: string, tap: number): string {
  return `paymenttracker:///?month=${dueDate.slice(0, 7)}&tap=${tap}`;
}
