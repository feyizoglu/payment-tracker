import { Payment, PaymentInstallment, RecurringPayment, Occurrence, CurrencyAmount } from "@/types";
import { addMonths, setDate, isAfter, isBefore, startOfDay } from "date-fns";

const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: "₺", USD: "$", EUR: "€", GBP: "£",
};

export function getCurrencySymbol(currency?: string): string {
  return CURRENCY_SYMBOLS[currency ?? "TRY"] ?? currency ?? "₺";
}

export const ALLOWED_CURRENCIES = ["TRY", "USD", "EUR", "GBP"];

// Validates and normalizes a raw `amounts` payload (multi-currency override lines).
// Blank-amount rows and non-object entries are skipped. Returns an error string for
// an invalid currency or a non-positive amount. A non-array input (field absent) or
// an array that cleans down to nothing yields `{ amounts: null }` so callers can fall
// back to the legacy single `amount`.
export function cleanCurrencyAmounts(
  input: unknown
): { amounts: CurrencyAmount[] | null } | { error: string } {
  if (!Array.isArray(input)) return { amounts: null };
  const cleaned: CurrencyAmount[] = [];
  for (const line of input) {
    if (!line || typeof line !== "object") continue;
    const l = line as Record<string, unknown>;
    if (l.amount === null || l.amount === "" || l.amount === undefined) continue;
    const currency = String(l.currency ?? "");
    const amt = Number(l.amount);
    if (!ALLOWED_CURRENCIES.includes(currency)) {
      return { error: `Invalid currency: ${currency}` };
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return { error: "Amounts must be positive numbers" };
    }
    cleaned.push({ currency, amount: amt });
  }
  return { amounts: cleaned.length > 0 ? cleaned : null };
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
    let dueDate = setDate(base, day);
    let amount = installmentAmount;
    let amounts: CurrencyAmount[] | undefined;
    let overridden = false;

    const override = payment.overrides?.find((o) => o.installment_index === i);
    if (override) {
      if (override.due_date) {
        const [oy, om, od] = override.due_date.split("-").map(Number);
        dueDate = new Date(oy, om - 1, od);
        overridden = true;
      }
      if (override.amounts && override.amounts.length > 0) {
        amounts = override.amounts;
        amount = override.amounts[0].amount; // representative value for single-currency consumers
        overridden = true;
      } else if (override.amount != null) {
        amount = override.amount;
        overridden = true;
      }
    }

    installments.push({
      index: i,
      dueDate,
      amount,
      amounts,
      isPaid: i < payment.paid_installments,
      overridden,
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
  return getInstallments(payment)
    .filter((inst) => !inst.isPaid)
    .reduce((sum, inst) => sum + inst.amount, 0);
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
  const out: Occurrence[] = [];
  for (const inst of getInstallments(payment)) {
    const base = {
      kind: "installment" as const,
      sourceId: payment.id,
      name: payment.name,
      user_id: payment.user_id,
      team_id: payment.team_id,
      dueDate: inst.dueDate,
      isPaid: inst.isPaid,
      installmentIndex: inst.index,
      totalInstallments: payment.total_installments,
      overridden: inst.overridden ?? false,
    };
    if (inst.amounts && inst.amounts.length > 0) {
      // One occurrence per currency line so downstream per-currency aggregation works unchanged.
      for (const line of inst.amounts) {
        out.push({ ...base, currency: line.currency ?? "TRY", amount: line.amount });
      }
    } else {
      out.push({ ...base, currency: payment.currency ?? "TRY", amount: inst.amount });
    }
  }
  return out;
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

  const period = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const entry = r.entries?.find((e) => e.period === period);

  let dueDate = new Date(year, month, clampDay(year, month, r.day_of_month));
  let overridden = false;
  if (entry?.due_date) {
    const [oy, om, od] = entry.due_date.split("-").map(Number);
    dueDate = new Date(oy, om - 1, od);
    overridden = true;
  }

  // Representative amount/currency for single-currency consumers; the calendar
  // range path expands multi-currency entries into one occurrence per line.
  const lines = entry?.amounts && entry.amounts.length > 0 ? entry.amounts : null;

  return {
    kind: "recurring",
    sourceId: r.id,
    name: r.name,
    currency: lines ? (lines[0].currency ?? "TRY") : (r.currency ?? "TRY"),
    user_id: r.user_id,
    team_id: r.team_id,
    dueDate,
    amount: lines ? lines[0].amount : (entry?.amount ?? null),
    isPaid: entry?.is_paid ?? false,
    overridden,
    period,
    entryId: entry?.id ?? null,
  };
}

// Expand a recurring occurrence into one occurrence per currency line when its
// entry has multi-currency amounts; otherwise return it unchanged.
function expandRecurringByCurrency(occ: Occurrence, r: RecurringPayment): Occurrence[] {
  const entry = r.entries?.find((e) => e.period === occ.period);
  if (entry?.amounts && entry.amounts.length > 0) {
    return entry.amounts.map((line) => ({
      ...occ,
      currency: line.currency ?? "TRY",
      amount: line.amount,
    }));
  }
  return [occ];
}

// All occurrences of a recurring payment whose effective dueDate falls within
// [start, end] (inclusive). Handles overrides that move a date to another month.
export function recurringOccurrencesInRange(
  r: RecurringPayment,
  start: Date,
  end: Date
): Occurrence[] {
  const out: Occurrence[] = [];
  const seenPeriods = new Set<string>();

  // 1. Entries with an explicit due_date override — wherever the date lands
  for (const e of r.entries ?? []) {
    if (!e.due_date) continue;
    seenPeriods.add(e.period);
    const [ey, em] = e.period.split("-").map(Number);
    const occ = recurringOccurrenceForMonth(r, ey, em - 1);
    if (occ && occ.dueDate >= start && occ.dueDate <= end) out.push(...expandRecurringByCurrency(occ, r));
  }

  // 2. Default-day occurrences for each month in range without a due_date override
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const period = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    if (!seenPeriods.has(period)) {
      const occ = recurringOccurrenceForMonth(r, y, m);
      if (occ && occ.dueDate >= start && occ.dueDate <= end) out.push(...expandRecurringByCurrency(occ, r));
    }
    m++;
    if (m > 11) { m = 0; y++; }
  }

  return out;
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
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  for (const r of recurrings) {
    result.push(...recurringOccurrencesInRange(r, monthStart, monthEnd));
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

  for (const r of recurrings) {
    result.push(...recurringOccurrencesInRange(r, start, end));
  }

  result.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return result;
}
