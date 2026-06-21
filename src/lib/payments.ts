import { Payment, PaymentInstallment, RecurringPayment, Occurrence } from "@/types";
import { addMonths, setDate, isAfter, isBefore, startOfDay } from "date-fns";

const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: "₺", USD: "$", EUR: "€", GBP: "£",
};

export function getCurrencySymbol(currency?: string): string {
  return CURRENCY_SYMBOLS[currency ?? "TRY"] ?? currency ?? "₺";
}

export function getInstallments(payment: Payment): PaymentInstallment[] {
  const installments: PaymentInstallment[] = [];
  const installmentAmount = payment.amount / payment.total_installments;

  // Parse date as local time (not UTC) to avoid timezone off-by-one
  const [sy, sm, sd] = payment.start_date.split("-").map(Number);

  for (let i = 0; i < payment.total_installments; i++) {
    const base = addMonths(new Date(sy, sm - 1, sd), i);
    // Clamp day to end of month if needed
    const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const day = Math.min(payment.day_of_month, maxDay);
    const dueDate = setDate(base, day);

    installments.push({
      index: i,
      dueDate,
      amount: installmentAmount,
      isPaid: i < payment.paid_installments,
    });
  }

  return installments;
}

export function getPaymentsForMonth(
  payments: Payment[],
  year: number,
  month: number // 0-indexed
): { payment: Payment; installment: PaymentInstallment }[] {
  const result: { payment: Payment; installment: PaymentInstallment }[] = [];

  for (const payment of payments) {
    const installments = getInstallments(payment);
    for (const inst of installments) {
      if (
        inst.dueDate.getFullYear() === year &&
        inst.dueDate.getMonth() === month
      ) {
        result.push({ payment, installment: inst });
      }
    }
  }

  result.sort((a, b) => a.installment.dueDate.getDate() - b.installment.dueDate.getDate());
  return result;
}

export function getTotalMonthly(payment: Payment): number {
  return payment.amount / payment.total_installments;
}

export function getRemainingAmount(payment: Payment): number {
  const remaining = payment.total_installments - payment.paid_installments;
  return (payment.amount / payment.total_installments) * remaining;
}

// ── Recurring / unified occurrence layer ────────────────────────────────────

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function clampDay(year: number, month: number, day: number): number {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, maxDay);
}

export function installmentOccurrences(payment: Payment): Occurrence[] {
  return getInstallments(payment).map((inst) => ({
    kind: "installment" as const,
    sourceId: payment.id,
    name: payment.name,
    currency: payment.currency ?? "TRY",
    user_id: payment.user_id,
    team_id: payment.team_id,
    dueDate: inst.dueDate,
    amount: inst.amount,
    isPaid: inst.isPaid,
    installmentIndex: inst.index,
    totalInstallments: payment.total_installments,
  }));
}

// Returns the occurrence for a recurring payment in the given month, or null if
// the payment is not active that month. month is 0-indexed.
export function recurringOccurrenceForMonth(
  r: RecurringPayment,
  year: number,
  month: number
): Occurrence | null {
  const start = parseLocalDate(r.start_month);
  const startY = start.getFullYear();
  const startM = start.getMonth();
  if (year < startY || (year === startY && month < startM)) return null;

  if (r.end_month) {
    const end = parseLocalDate(r.end_month);
    const endY = end.getFullYear();
    const endM = end.getMonth();
    if (year > endY || (year === endY && month > endM)) return null;
  }

  const day = clampDay(year, month, r.day_of_month);
  const dueDate = new Date(year, month, day);
  const period = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const entry = r.entries?.find((e) => e.period === period);

  return {
    kind: "recurring",
    sourceId: r.id,
    name: r.name,
    currency: r.currency ?? "TRY",
    user_id: r.user_id,
    team_id: r.team_id,
    dueDate,
    amount: entry?.amount ?? null,
    isPaid: entry?.is_paid ?? false,
    period,
    entryId: entry?.id ?? null,
  };
}

export function getOccurrencesForMonth(
  payments: Payment[],
  recurrings: RecurringPayment[],
  year: number,
  month: number
): Occurrence[] {
  const result: Occurrence[] = [];

  for (const p of payments) {
    for (const occ of installmentOccurrences(p)) {
      if (occ.dueDate.getFullYear() === year && occ.dueDate.getMonth() === month) {
        result.push(occ);
      }
    }
  }
  for (const r of recurrings) {
    const occ = recurringOccurrenceForMonth(r, year, month);
    if (occ) result.push(occ);
  }

  result.sort((a, b) => a.dueDate.getDate() - b.dueDate.getDate());
  return result;
}

export function getOccurrencesInRange(
  payments: Payment[],
  recurrings: RecurringPayment[],
  start: Date,
  end: Date
): Occurrence[] {
  const result: Occurrence[] = [];

  for (const p of payments) {
    for (const occ of installmentOccurrences(p)) {
      if (occ.dueDate >= start && occ.dueDate <= end) result.push(occ);
    }
  }

  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    for (const r of recurrings) {
      const occ = recurringOccurrenceForMonth(r, y, m);
      if (occ && occ.dueDate >= start && occ.dueDate <= end) result.push(occ);
    }
    m++;
    if (m > 11) { m = 0; y++; }
  }

  result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return result;
}
