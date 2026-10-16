import { buildShares } from "@/lib/split";
import { isCurrency, isIsoDate, parseAmountMinor } from "@/lib/event-validators";
import type { EventExpenseShare, ExpenseInput, ExpenseSplitInput } from "@/types";

export type ParsedExpense =
  | { ok: true; row: Omit<ExpenseInput, "split">; shares: EventExpenseShare[] }
  | { ok: false; error: string };

function asSplit(value: unknown): ExpenseSplitInput | null {
  const v = value as { kind?: unknown; participant_ids?: unknown; shares?: unknown } | null;
  if (v?.kind === "equal" && Array.isArray(v.participant_ids) && v.participant_ids.every((x) => typeof x === "string")) {
    return { kind: "equal", participant_ids: v.participant_ids };
  }
  if (
    v?.kind === "exact" &&
    Array.isArray(v.shares) &&
    v.shares.every((s) => typeof s?.participant_id === "string" && typeof s?.amount_minor === "number")
  ) {
    const shares = v.shares as { participant_id: string; amount_minor: number }[];
    return { kind: "exact", shares: shares.map(({ participant_id, amount_minor }) => ({ participant_id, amount_minor })) };
  }
  return null;
}

export function parseExpenseInput(body: Record<string, unknown> | null, participantIds: string[]): ParsedExpense {
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) return { ok: false, error: "Description is required" };
  const amount = parseAmountMinor(body?.amount_minor);
  if (amount === null) return { ok: false, error: "Invalid amount" };
  if (!isCurrency(body?.currency)) return { ok: false, error: "Invalid currency" };
  if (typeof body?.paid_by !== "string" || !participantIds.includes(body.paid_by)) return { ok: false, error: "Invalid payer" };
  if (!isIsoDate(body?.spent_on)) return { ok: false, error: "Invalid date" };
  const split = asSplit(body?.split);
  if (!split) return { ok: false, error: "Invalid split" };
  const built = buildShares(amount, split, participantIds);
  if (!built.ok) return built;
  return {
    ok: true,
    row: { description, amount_minor: amount, currency: body.currency as string, paid_by: body.paid_by, spent_on: body.spent_on },
    shares: built.shares,
  };
}
