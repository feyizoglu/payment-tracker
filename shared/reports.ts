import { getCurrencySymbol, getOccurrencesInRange } from "./payments";
import type { Occurrence, Payment, RecurringPayment } from "./types";

// Reporting maths shared by the web report views and the mobile Reports tab.
//
// Everything here works on OCCURRENCES rather than raw installments. That matters:
// occurrences include recurring reminders and split a multi-currency override into one
// occurrence per currency line, so totals cannot silently drop a whole payment type or
// collapse two currencies into one.

export type CurrencyTotals = Record<string, number>;

// Totals per currency. There is deliberately no FX conversion — a report that invented
// a single number would hide which currency the money is actually owed in. Occurrences
// with no amount (a recurring reminder whose month has not been filled in) are skipped
// rather than counted as zero.
export function sumByCurrency(occurrences: Occurrence[]): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const occurrence of occurrences) {
    if (occurrence.amount == null) continue;
    const currency = occurrence.currency || "TRY";
    totals[currency] = (totals[currency] ?? 0) + occurrence.amount;
  }
  return totals;
}

// "₺1.000,00 + $50,00" — an empty string when there is nothing to show, so callers can
// fall back to their own placeholder.
export function formatCurrencyTotals(totals: CurrencyTotals, locale = "tr-TR"): string {
  return Object.entries(totals)
    .map(
      ([currency, amount]) =>
        `${getCurrencySymbol(currency)}${amount.toLocaleString(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
    )
    .join(" + ");
}

export interface RangeReport {
  occurrences: Occurrence[]; // date-ascending
  due: CurrencyTotals; // everything in the range
  paid: CurrencyTotals;
  remaining: CurrencyTotals; // the unpaid part
}

export function rangeReport(
  payments: Payment[],
  recurrings: RecurringPayment[],
  start: Date,
  end: Date
): RangeReport {
  // An inverted range is a half-typed date, not an error worth surfacing.
  if (start > end) return { occurrences: [], due: {}, paid: {}, remaining: {} };

  const occurrences = getOccurrencesInRange(payments, recurrings, start, end);
  return {
    occurrences,
    due: sumByCurrency(occurrences),
    paid: sumByCurrency(occurrences.filter((occurrence) => occurrence.isPaid)),
    remaining: sumByCurrency(occurrences.filter((occurrence) => !occurrence.isPaid)),
  };
}

export interface PayUntilReport {
  occurrences: Occurrence[]; // unpaid only, date-ascending
  byCurrency: CurrencyTotals;
}

// "What will I still have to pay between now and <date>" — the unpaid slice of a range
// that always starts today.
export function payUntilReport(
  payments: Payment[],
  recurrings: RecurringPayment[],
  today: Date,
  end: Date
): PayUntilReport {
  if (today > end) return { occurrences: [], byCurrency: {} };

  const occurrences = getOccurrencesInRange(payments, recurrings, today, end).filter(
    (occurrence) => !occurrence.isPaid
  );
  return { occurrences, byCurrency: sumByCurrency(occurrences) };
}

// Start of today / end of the given day — the boundaries both reports need so a payment
// due later today is not excluded by the current clock time.
export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
