import type { EventExpense, EventExpenseShare, EventParticipant, EventSettlement, ExpenseSplitInput } from "./types";

// currency -> participant id -> net minor units (positive = owed money).
export type Balances = Record<string, Record<string, number>>;

export interface Transfer {
  from: string;
  to: string;
  amount_minor: number;
  currency: string;
}

export function splitEqually(totalMinor: number, participantIds: string[]): EventExpenseShare[] {
  const base = Math.floor(totalMinor / participantIds.length);
  const extra = totalMinor - base * participantIds.length;
  return participantIds.map((participant_id, i) => ({ participant_id, amount_minor: base + (i < extra ? 1 : 0) }));
}

// Validates a split against the event's participants (in join order) and returns the
// stored shares. Equal shares follow join order so the leftover cent is deterministic.
export function buildShares(
  amountMinor: number,
  split: ExpenseSplitInput,
  eventParticipantIds: string[]
): { ok: true; shares: EventExpenseShare[] } | { ok: false; error: string } {
  const known = new Set(eventParticipantIds);
  if (split.kind === "equal") {
    const chosen = new Set(split.participant_ids);
    if (chosen.size === 0 || chosen.size !== split.participant_ids.length) return { ok: false, error: "Invalid participants" };
    if ([...chosen].some((id) => !known.has(id))) return { ok: false, error: "Invalid participants" };
    return { ok: true, shares: splitEqually(amountMinor, eventParticipantIds.filter((id) => chosen.has(id))) };
  }
  const ids = split.shares.map((s) => s.participant_id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) return { ok: false, error: "Invalid participants" };
  if (split.shares.some((s) => !Number.isInteger(s.amount_minor) || s.amount_minor < 0)) return { ok: false, error: "Invalid share amount" };
  if (split.shares.reduce((sum, s) => sum + s.amount_minor, 0) !== amountMinor) return { ok: false, error: "Shares must add up to the amount" };
  const shares = split.shares
    .filter((s) => s.amount_minor > 0)
    .map(({ participant_id, amount_minor }) => ({ participant_id, amount_minor }));
  if (shares.length === 0) return { ok: false, error: "Invalid participants" };
  return { ok: true, shares };
}

export function balances(expenses: EventExpense[], settlements: EventSettlement[]): Balances {
  const out: Balances = {};
  const add = (currency: string, id: string, delta: number) => {
    const row = (out[currency] ??= {});
    row[id] = (row[id] ?? 0) + delta;
  };
  for (const e of expenses) {
    add(e.currency, e.paid_by, e.amount_minor);
    for (const s of e.shares) add(e.currency, s.participant_id, -s.amount_minor);
  }
  for (const s of settlements) {
    add(s.currency, s.from_participant, s.amount_minor);
    add(s.currency, s.to_participant, -s.amount_minor);
  }
  return out;
}

export function suggestTransfers(b: Balances): Transfer[] {
  const transfers: Transfer[] = [];
  for (const currency of Object.keys(b).sort()) {
    const byAmount = (x: [string, number], y: [string, number]) => y[1] - x[1] || x[0].localeCompare(y[0]);
    const creditors = Object.entries(b[currency]).filter(([, v]) => v > 0).sort(byAmount);
    const debtors = Object.entries(b[currency]).filter(([, v]) => v < 0).map(([id, v]) => [id, -v] as [string, number]).sort(byAmount);
    while (creditors.length && debtors.length) {
      const [c, d] = [creditors[0], debtors[0]];
      const amount = Math.min(c[1], d[1]);
      transfers.push({ from: d[0], to: c[0], amount_minor: amount, currency });
      c[1] -= amount;
      d[1] -= amount;
      if (c[1] === 0) creditors.shift();
      if (d[1] === 0) debtors.shift();
      creditors.sort(byAmount);
      debtors.sort(byAmount);
    }
  }
  return transfers;
}

// "12", "12.5" or "12,50" -> 1250. Built from the digits so 1.15 cannot become 114.
export function parseDecimalToMinor(text: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function participantLabel(p: EventParticipant): string {
  return p.user?.name ?? p.user?.email ?? p.display_name ?? "?";
}

export function formatMinor(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountMinor / 100);
}
