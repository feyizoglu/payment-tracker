import type { CurrencyAmount, Occurrence, Payment, RecurringPayment } from "@ptracker/shared/types";

// Pure helpers for the occurrence edit screen. The endpoint/body decision itself is
// NOT here — it lives in @ptracker/shared/edit-occurrence (decideEditSubmit), shared
// with the web modal. What is here is everything around it: identifying which
// occurrence the route points at, seeding the amount lines, and validating them.

export interface AmountLine {
  currency: string;
  amount: string; // kept as typed text; parsed on submit
}

export interface OccurrenceRef {
  kind: "installment" | "recurring";
  sourceId: string;
  installmentIndex?: number;
  period?: string;
}

// Reads the route params back into a reference. Returns null when a param is missing
// or malformed, so the screen can show "could not load" instead of guessing.
export function parseOccurrenceRef(params: {
  kind?: string;
  sourceId?: string;
  installmentIndex?: string;
  period?: string;
}): OccurrenceRef | null {
  if (!params.sourceId) return null;

  if (params.kind === "recurring") {
    if (!params.period) return null;
    return { kind: "recurring", sourceId: params.sourceId, period: params.period };
  }

  if (params.kind === "installment") {
    const index = Number(params.installmentIndex);
    if (!Number.isInteger(index) || index < 0) return null;
    return { kind: "installment", sourceId: params.sourceId, installmentIndex: index };
  }

  return null;
}

// Picks the occurrence the route refers to out of a month's occurrences. A multi-
// currency installment produces one occurrence per currency line; they share a due
// date and are edited together, so the first match is the right one.
export function findOccurrence(occurrences: Occurrence[], ref: OccurrenceRef): Occurrence | null {
  return (
    occurrences.find(
      (o) =>
        o.kind === ref.kind &&
        o.sourceId === ref.sourceId &&
        (ref.kind === "recurring" ? o.period === ref.period : o.installmentIndex === ref.installmentIndex)
    ) ?? null
  );
}

// Current amount lines for an installment occurrence: an existing multi-currency
// override wins, then a legacy single-amount override, then the series default.
// Mirrors installmentInitialAmounts in the web CalendarView.
export function installmentInitialAmounts(occurrence: Occurrence, payments: Payment[]): CurrencyAmount[] {
  const payment = payments.find((p) => p.id === occurrence.sourceId);
  if (!payment) return [{ currency: occurrence.currency ?? "TRY", amount: occurrence.amount ?? 0 }];

  const override = payment.overrides?.find((ov) => ov.installment_index === occurrence.installmentIndex);
  if (override?.amounts && override.amounts.length > 0) return override.amounts;
  if (override?.amount != null) return [{ currency: payment.currency ?? "TRY", amount: override.amount }];

  const perInstallment = payment.amount / payment.total_installments;
  return [{ currency: payment.currency ?? "TRY", amount: Number(perInstallment.toFixed(2)) }];
}

// Same for a recurring occurrence's month. Reminders carry no default amount, so the
// fallback line is blank (0) for the user to fill in.
export function recurringInitialAmounts(
  occurrence: Occurrence,
  recurrings: RecurringPayment[]
): CurrencyAmount[] {
  const recurring = recurrings.find((r) => r.id === occurrence.sourceId);
  const entry = recurring?.entries?.find((e) => e.period === occurrence.period);

  if (entry?.amounts && entry.amounts.length > 0) return entry.amounts;
  if (entry?.amount != null) {
    return [{ currency: recurring?.currency ?? occurrence.currency ?? "TRY", amount: entry.amount }];
  }
  return [{ currency: recurring?.currency ?? occurrence.currency ?? "TRY", amount: 0 }];
}

export function initialAmountLines(
  occurrence: Occurrence,
  payments: Payment[],
  recurrings: RecurringPayment[]
): AmountLine[] {
  const amounts =
    occurrence.kind === "recurring"
      ? recurringInitialAmounts(occurrence, recurrings)
      : installmentInitialAmounts(occurrence, payments);

  // A zero seeds an empty field rather than a literal "0" the user has to clear.
  return amounts.map((a) => ({ currency: a.currency, amount: a.amount ? String(a.amount) : "" }));
}

// Blank rows are dropped; anything else must be a positive number. Returns null on the
// first invalid row so the caller can show its own message.
export function parseAmountLines(lines: AmountLine[]): CurrencyAmount[] | null {
  const amounts: CurrencyAmount[] = [];
  for (const line of lines) {
    if (line.amount.trim() === "") continue;
    const value = Number(line.amount);
    if (!Number.isFinite(value) || value <= 0) return null;
    amounts.push({ currency: line.currency, amount: value });
  }
  return amounts;
}
