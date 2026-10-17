import { parseDecimalToMinor, splitEqually } from "@ptracker/shared/split";
import type { EventExpense, EventParticipant, ExpenseInput } from "@ptracker/shared/types";

export interface ExpenseForm {
  description: string;
  amount: string;
  currency: string;
  paidBy: string;
  spentOn: string;
  mode: "equal" | "exact";
  selected: string[];
  exact: Record<string, string>;
}

export type ExpenseFormResult = { ok: true; body: ExpenseInput } | { ok: false; field: "description" | "amount" | "split" };

const minorToText = (m: number) => (m / 100).toFixed(2);

export function emptyExpenseForm(participants: EventParticipant[], myParticipantId: string | null, today: string): ExpenseForm {
  const ids = participants.map((p) => p.id);
  return {
    description: "",
    amount: "",
    currency: "TRY",
    paidBy: myParticipantId && ids.includes(myParticipantId) ? myParticipantId : (ids[0] ?? ""),
    spentOn: today,
    mode: "equal",
    selected: ids,
    exact: Object.fromEntries(ids.map((id) => [id, ""])),
  };
}

export function remainingMinor(form: ExpenseForm): number | null {
  const total = parseDecimalToMinor(form.amount);
  if (total === null) return null;
  let sum = 0;
  for (const text of Object.values(form.exact)) {
    if (!text.trim()) continue;
    const v = parseDecimalToMinor(text);
    if (v === null) return null;
    sum += v;
  }
  return total - sum;
}

export function expenseFormToBody(form: ExpenseForm, participants: EventParticipant[]): ExpenseFormResult {
  const description = form.description.trim();
  if (!description) return { ok: false, field: "description" };
  const amount = parseDecimalToMinor(form.amount);
  if (amount === null || amount <= 0) return { ok: false, field: "amount" };
  const order = participants.map((p) => p.id);
  const base = { description, amount_minor: amount, currency: form.currency, paid_by: form.paidBy, spent_on: form.spentOn };
  if (form.mode === "equal") {
    const ids = order.filter((id) => form.selected.includes(id));
    if (ids.length === 0) return { ok: false, field: "split" };
    return { ok: true, body: { ...base, split: { kind: "equal", participant_ids: ids } } };
  }
  const shares: { participant_id: string; amount_minor: number }[] = [];
  for (const id of order) {
    const text = form.exact[id]?.trim() ?? "";
    if (!text) continue;
    const v = parseDecimalToMinor(text);
    if (v === null) return { ok: false, field: "split" };
    if (v > 0) shares.push({ participant_id: id, amount_minor: v });
  }
  if (shares.length === 0 || shares.reduce((s, x) => s + x.amount_minor, 0) !== amount) return { ok: false, field: "split" };
  return { ok: true, body: { ...base, split: { kind: "exact", shares } } };
}

export function expenseFormFromExpense(expense: EventExpense, participants: EventParticipant[]): ExpenseForm {
  const order = participants.map((p) => p.id);
  const sharedIds = order.filter((id) => expense.shares.some((s) => s.participant_id === id));
  const equal = splitEqually(expense.amount_minor, sharedIds);
  const isEqual =
    equal.length === expense.shares.length &&
    equal.every((e) => expense.shares.some((s) => s.participant_id === e.participant_id && s.amount_minor === e.amount_minor));
  return {
    description: expense.description,
    amount: minorToText(expense.amount_minor),
    currency: expense.currency,
    paidBy: expense.paid_by,
    spentOn: expense.spent_on,
    mode: isEqual ? "equal" : "exact",
    selected: isEqual ? sharedIds : order,
    exact: Object.fromEntries(
      order.map((id) => {
        const s = expense.shares.find((x) => x.participant_id === id);
        return [id, isEqual || !s ? "" : minorToText(s.amount_minor)];
      })
    ),
  };
}
