import type { Team } from "@ptracker/shared/types";

// Pure form logic for the "add payment" screen: state shape, validation, and the
// request the screen dispatches. Kept out of the .tsx so it is testable in the node
// vitest env — same split as markPaidRequest in lib/occurrences.ts.

export type EntryKind = "installment" | "recurring";
export type AmountInputMode = "total" | "installment";

export interface PaymentFormState {
  entryKind: EntryKind;
  name: string;
  inputMode: AmountInputMode;
  totalAmount: string;
  installmentAmount: string;
  currency: string;
  startDate: string; // 'yyyy-MM-dd'
  totalInstallments: string;
  endMonth: string; // 'yyyy-MM' | ''
  teamId: string; // '' = personal
  targetUserId: string; // '' = myself
}

// Validation messages the screen must supply, so the copy stays in the shared
// dictionary instead of being duplicated here.
export interface FormMessages {
  fillRequired: string;
  amountPositive: string;
  installmentsRange: string;
}

export function emptyPaymentForm(overrides: Partial<PaymentFormState> = {}): PaymentFormState {
  return {
    entryKind: "installment",
    name: "",
    inputMode: "total",
    totalAmount: "",
    installmentAmount: "",
    currency: "TRY",
    startDate: "",
    totalInstallments: "1",
    endMonth: "",
    teamId: "",
    targetUserId: "",
    ...overrides,
  };
}

export function installmentCount(state: PaymentFormState): number {
  return parseInt(state.totalInstallments, 10) || 0;
}

// The amount the user did not type, shown as a hint (mirrors the web form).
export function computedTotal(state: PaymentFormState): number {
  return state.inputMode === "installment"
    ? (parseFloat(state.installmentAmount) || 0) * installmentCount(state)
    : parseFloat(state.totalAmount) || 0;
}

export function computedInstallment(state: PaymentFormState): number {
  const count = installmentCount(state);
  if (state.inputMode === "installment") return parseFloat(state.installmentAmount) || 0;
  return count > 0 ? (parseFloat(state.totalAmount) || 0) / count : 0;
}

// Returns the first problem, or null when the form can be submitted. The native
// screen has no HTML `required`/`min`, so every rule the web form leaned on the
// browser for is enforced here.
export function validatePaymentForm(state: PaymentFormState, messages: FormMessages): string | null {
  if (!state.name.trim() || !state.startDate) return messages.fillRequired;
  if (state.entryKind === "recurring") return null;

  const count = installmentCount(state);
  if (count < 1 || count > 120) return messages.installmentsRange;

  const amount = state.inputMode === "total" ? parseFloat(state.totalAmount) : parseFloat(state.installmentAmount);
  if (!Number.isFinite(amount) || amount <= 0) return messages.amountPositive;

  return null;
}

// The POST the screen sends. `team_id: null` means personal; `target_user_id` is only
// meaningful with a team, and the API rejects it otherwise.
export function paymentFormToRequest(state: PaymentFormState): {
  url: string;
  body: Record<string, unknown>;
} {
  const teamId = state.teamId || null;
  const targetUserId = teamId && state.targetUserId ? state.targetUserId : undefined;

  if (state.entryKind === "recurring") {
    return {
      url: "/api/recurring",
      body: {
        name: state.name.trim(),
        currency: state.currency,
        start_date: state.startDate,
        end_month: state.endMonth || undefined,
        team_id: teamId,
        target_user_id: targetUserId,
      },
    };
  }

  const count = installmentCount(state);
  const amount =
    state.inputMode === "total"
      ? parseFloat(state.totalAmount)
      : parseFloat(state.installmentAmount) * count;

  return {
    url: "/api/payments",
    body: {
      name: state.name.trim(),
      amount,
      currency: state.currency,
      start_date: state.startDate,
      total_installments: count,
      team_id: teamId,
      target_user_id: targetUserId,
    },
  };
}

// "Add for <member>" is offered only when the signed-in user owns the selected team —
// the API enforces the same rule and 403s otherwise.
export function assignableMembers(
  teams: Team[],
  teamId: string,
  currentUserId: string | undefined
): { userId: string; name: string }[] {
  const team = teams.find((candidate) => candidate.id === teamId);
  const isOwner = !!team?.members?.some((m) => m.user_id === currentUserId && m.role === "owner");
  if (!team || !isOwner) return [];

  return (team.members ?? [])
    .filter((m) => m.user_id !== currentUserId)
    .map((m) => ({ userId: m.user_id, name: m.user?.name || m.user?.email || m.user_id }));
}
