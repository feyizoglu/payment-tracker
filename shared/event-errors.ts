import type { Translations } from "./i18n";

// The event API's 409 messages, shared so the apps can show them in the user's language.
export const EVENT_CLOSED_ERROR = "Event is closed";
export const SETTLEMENT_ABOVE_DEBT_ERROR = "Amount is more than the current debt";

/** The user's-language text for a known event API error message, or null for any other. */
export function eventErrorText(message: unknown, t: Pick<Translations, "eventIsClosed" | "amountAboveDebt">): string | null {
  if (message === EVENT_CLOSED_ERROR) return t.eventIsClosed;
  if (message === SETTLEMENT_ABOVE_DEBT_ERROR) return t.amountAboveDebt;
  return null;
}
