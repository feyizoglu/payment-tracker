import type { Occurrence, CurrencyAmount } from "./types";
import { isPureDayChange } from "./payments";

// Transport builder for the occurrence edit modal. It maps an occurrence edit to the
// API endpoint + request body. Shared by web and mobile: both clients talk to the same
// /api/* routes, so the mapping lives here rather than being duplicated per platform.
//
// `scope: "forward"` targets this and every following occurrence, but only for a pure
// day-of-month change and never on reset; otherwise the edit stays scoped to this one
// occurrence. Amounts must already be validated by the caller.
export function decideEditSubmit(params: {
  occurrence: Occurrence;
  reset: boolean;
  scope: "one" | "forward";
  date: string; // 'yyyy-MM-dd' | ''
  initialDate: string; // original 'yyyy-MM-dd'
  amounts: CurrencyAmount[];
}): { url: string; body: Record<string, unknown> } {
  const { occurrence, reset, scope, date, initialDate, amounts } = params;
  const isRecurring = occurrence.kind === "recurring";
  const forward = !reset && scope === "forward" && isPureDayChange(date, initialDate);

  let body: Record<string, unknown>;
  if (reset) {
    // Recurring "Reset day" clears only the date override; installment reset removes
    // the whole override.
    body = isRecurring
      ? { period: occurrence.period, due_date: null }
      : { installment_index: occurrence.installmentIndex, due_date: null, amount: null };
  } else if (forward) {
    const day = Number(date.slice(8, 10)); // day-of-month from the picked date
    body = isRecurring
      ? { period: occurrence.period, day, amounts }
      : { from_installment_index: occurrence.installmentIndex, day, amounts };
  } else {
    body = isRecurring
      ? { period: occurrence.period, due_date: date || null, amounts }
      : { installment_index: occurrence.installmentIndex, due_date: date || null, amounts };
  }

  const url = isRecurring
    ? `/api/recurring/${occurrence.sourceId}/${forward ? "day-forward" : "entry"}`
    : `/api/payments/${occurrence.sourceId}/${forward ? "day-forward" : "override"}`;

  return { url, body };
}
