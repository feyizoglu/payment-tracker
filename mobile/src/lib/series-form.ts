import type { Payment, RecurringPayment } from "@ptracker/shared/types";

// Pure form logic for the two "edit series" screens (an installment payment and a
// recurring reminder). Same split as payment-form.ts: the .tsx only renders and
// dispatches, everything decidable lives here so vitest can cover it.

export interface InstallmentSeriesState {
  name: string;
  amount: string;
  currency: string;
  totalInstallments: string;
}

export interface RecurringSeriesState {
  name: string;
  dayOfMonth: string;
  currency: string;
  endMonth: string; // 'yyyy-MM' | ''
}

export interface SeriesMessages {
  fillRequired: string;
  amountPositive: string;
  installmentsRange: string;
  installmentsBelowPaid: string;
  dayRange: string;
}

export function installmentSeriesState(payment: Payment): InstallmentSeriesState {
  return {
    name: payment.name,
    amount: String(payment.amount),
    currency: payment.currency ?? "TRY",
    totalInstallments: String(payment.total_installments),
  };
}

export function recurringSeriesState(recurring: RecurringPayment): RecurringSeriesState {
  return {
    name: recurring.name,
    dayOfMonth: String(recurring.day_of_month),
    currency: recurring.currency ?? "TRY",
    // end_month is stored as a full 'yyyy-MM-01' date; the picker speaks 'yyyy-MM'.
    endMonth: recurring.end_month ? recurring.end_month.slice(0, 7) : "",
  };
}

// `paidInstallments` guards the same rule the web modal enforces: the series cannot
// shrink below what has already been paid off.
export function validateInstallmentSeries(
  state: InstallmentSeriesState,
  paidInstallments: number,
  messages: SeriesMessages
): string | null {
  if (!state.name.trim()) return messages.fillRequired;

  const amount = parseFloat(state.amount);
  if (!Number.isFinite(amount) || amount <= 0) return messages.amountPositive;

  const total = parseInt(state.totalInstallments, 10);
  if (!Number.isFinite(total) || total < 1 || total > 120) return messages.installmentsRange;
  if (total < paidInstallments) return messages.installmentsBelowPaid;

  return null;
}

export function validateRecurringSeries(
  state: RecurringSeriesState,
  messages: SeriesMessages
): string | null {
  if (!state.name.trim()) return messages.fillRequired;

  const day = parseInt(state.dayOfMonth, 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) return messages.dayRange;

  return null;
}

export function installmentSeriesToBody(state: InstallmentSeriesState): Record<string, unknown> {
  return {
    name: state.name.trim(),
    amount: Number(state.amount),
    currency: state.currency,
    total_installments: parseInt(state.totalInstallments, 10),
  };
}

export function recurringSeriesToBody(state: RecurringSeriesState): Record<string, unknown> {
  return {
    name: state.name.trim(),
    day_of_month: parseInt(state.dayOfMonth, 10),
    currency: state.currency,
    // null (not undefined) so clearing the end month actually clears it server-side.
    end_month: state.endMonth || null,
  };
}
