import { isGoldType } from "@ptracker/shared/economy";
import type { Asset, Currency } from "@ptracker/shared/types";

// Pure form logic for the asset create/edit screens, kept out of the .tsx so the node
// vitest setup can cover it — same split as payment-form.ts.

export interface AssetFormState {
  bankName: string;
  currency: Currency;
  amount: string;
  teamId: string; // '' = personal
  targetUserId: string; // '' = myself
}

export interface AssetEditState {
  bankName: string;
  amount: string;
}

export interface AssetMessages {
  fillRequired: string;
  amountPositive: string;
}

export function emptyAssetForm(overrides: Partial<AssetFormState> = {}): AssetFormState {
  return {
    bankName: "",
    currency: "USD",
    amount: "",
    teamId: "",
    targetUserId: "",
    ...overrides,
  };
}

export function assetEditState(asset: Asset): AssetEditState {
  return { bankName: asset.bank_name, amount: String(asset.amount) };
}

export function validateAssetForm(state: AssetFormState, messages: AssetMessages): string | null {
  if (!state.bankName.trim()) return messages.fillRequired;

  const amount = parseFloat(state.amount);
  if (!Number.isFinite(amount) || amount <= 0) return messages.amountPositive;

  return null;
}

export function validateAssetEdit(state: AssetEditState, messages: AssetMessages): string | null {
  if (!state.bankName.trim()) return messages.fillRequired;

  const amount = parseFloat(state.amount);
  if (!Number.isFinite(amount) || amount <= 0) return messages.amountPositive;

  return null;
}

// POST body. `target_user_id` only travels with a team — the API 400s otherwise.
export function assetFormToBody(state: AssetFormState): Record<string, unknown> {
  const teamId = state.teamId || null;
  return {
    bank_name: state.bankName.trim(),
    currency: state.currency,
    amount: Number(state.amount),
    team_id: teamId,
    target_user_id: teamId && state.targetUserId ? state.targetUserId : undefined,
  };
}

// PATCH body. Currency and team are deliberately absent: the web modal does not let
// them change either, and re-denominating an existing asset would silently rewrite its
// value rather than convert it.
export function assetEditToBody(state: AssetEditState): Record<string, unknown> {
  return { bank_name: state.bankName.trim(), amount: Number(state.amount) };
}

// The unit hint shown next to the amount field: grams/pieces for gold, nothing for fiat
// (the currency symbol already says what the number means).
export function amountUnitHint(currency: Currency, goldGramsLabel: string, piecesLabel: string): string | undefined {
  if (!isGoldType(currency)) return undefined;
  return currency === "BILEZIK" || currency === "GRAM_ALTIN" ? goldGramsLabel : piecesLabel;
}
