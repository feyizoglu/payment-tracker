import type { Occurrence, Payment, RecurringEntry, RecurringPayment } from "./types";

export interface MarkPaidRequest {
  url: string;
  method: "PATCH" | "PUT";
  body: Record<string, unknown>;
}

// Edits to the two lists a screen holds; each is a pure updater for setState.
export interface ListEdit {
  payments?: (payments: Payment[]) => Payment[];
  recurrings?: (recurrings: RecurringPayment[]) => RecurringPayment[];
}

export interface MarkPaidPlan {
  request: MarkPaidRequest;
  // Applied before the request is sent, so the tick shows at once.
  optimistic: ListEdit;
  // Records the row the server stored, once the request succeeds.
  confirmed: (reply: unknown) => ListEdit;
}

// Builds the API request that toggles an occurrence's paid state.
// Installments advance/rewind the parent payment's paid_installments count;
// recurring entries flip the per-period is_paid flag.
export function markPaidRequest(o: Occurrence): MarkPaidRequest {
  if (o.kind === "installment") {
    const idx = o.installmentIndex ?? 0;
    const paid_installments = o.isPaid ? idx : idx + 1;
    return { url: `/api/payments/${o.sourceId}`, method: "PATCH", body: { paid_installments } };
  }
  return {
    url: `/api/recurring/${o.sourceId}/entry`,
    method: "PUT",
    body: { period: o.period, is_paid: !o.isPaid },
  };
}

export function withPaidInstallments(payments: Payment[], paymentId: string, paid: number): Payment[] {
  return payments.map((p) => (p.id === paymentId ? { ...p, paid_installments: paid } : p));
}

export function withRecurringEntry(
  recurrings: RecurringPayment[],
  recurringId: string,
  entry: Partial<RecurringEntry> & Pick<RecurringEntry, "period">
): RecurringPayment[] {
  return recurrings.map((r) => {
    if (r.id !== recurringId) return r;
    const entries = r.entries ?? [];
    const existing = entries.find((e) => e.period === entry.period);
    const merged: RecurringEntry = existing
      ? { ...existing, ...entry }
      : {
          id: "",
          recurring_id: recurringId,
          amount: null,
          amounts: null,
          is_paid: false,
          paid_at: null,
          due_date: null,
          created_at: "",
          ...entry,
        };
    return {
      ...r,
      entries: existing ? entries.map((e) => (e === existing ? merged : e)) : [...entries, merged],
    };
  });
}

export function planMarkPaid(o: Occurrence): MarkPaidPlan {
  const request = markPaidRequest(o);
  if (o.kind === "installment") {
    const paid = request.body.paid_installments as number;
    return {
      request,
      optimistic: { payments: (p) => withPaidInstallments(p, o.sourceId, paid) },
      confirmed: (reply) => {
        const row = reply as Partial<Payment> | null;
        if (typeof row?.paid_installments !== "number") return {};
        const stored = row.paid_installments;
        return { payments: (p) => withPaidInstallments(p, o.sourceId, stored) };
      },
    };
  }
  const isPaid = !o.isPaid;
  return {
    request,
    optimistic: {
      recurrings: (r) =>
        withRecurringEntry(r, o.sourceId, {
          period: o.period!,
          is_paid: isPaid,
          paid_at: isPaid ? new Date().toISOString() : null,
        }),
    },
    confirmed: (reply) => {
      const entry = reply as RecurringEntry | null;
      if (!entry || entry.period !== o.period) return {};
      return { recurrings: (r) => withRecurringEntry(r, o.sourceId, entry) };
    },
  };
}
