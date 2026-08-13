import type { ExchangeRates } from "@ptracker/shared/types";

// Endpoint + the decision table the Economy screen's rate banner renders. Kept pure so
// the "what does the user see about the rates right now" question is testable.

export const EXCHANGE_RATES_PATH = "/api/exchange-rates";

export type RatesStatus = "idle" | "ok" | "error";

export interface RatesBanner {
  // never   — no rates yet, tell the user to refresh
  // updated — show the time they were fetched
  // error   — the last fetch failed (older cached rates may still be on screen)
  kind: "never" | "updated" | "error";
  time?: string; // 'HH:mm', only on "updated"
  goldError?: string; // set independently: fiat rates can be fine while gold failed
}

// Local-time HH:mm, matching the web page's `toLocaleTimeString` display. Returns null
// for a missing or unparseable timestamp rather than "Invalid Date".
export function formatFetchedAt(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function ratesBanner(rates: ExchangeRates | null, status: RatesStatus): RatesBanner {
  const goldError = rates?.goldError || undefined;

  // An error wins over a stale timestamp: the numbers on screen are not current.
  if (status === "error") return { kind: "error", goldError };
  if (!rates) return { kind: "never" };

  const time = formatFetchedAt(rates.fetchedAt);
  return time ? { kind: "updated", time, goldError } : { kind: "never", goldError };
}

// Status after restoring rates from the cache. Only the very first restore may report
// success: the Economy tab re-reads the cache on every focus (so a manual gold entry
// shows up), and a failed refresh must keep its error banner rather than have a tab
// switch silently present stale numbers as current.
export function restoredRatesStatus(previous: RatesStatus): RatesStatus {
  return previous === "idle" ? "ok" : previous;
}

// Whether the manual gold entry can work at all: the conversion multiplies lira prices
// by the USD-per-TRY rate, so without it there is nothing to convert with.
export function canEnterGoldManually(rates: ExchangeRates | null): boolean {
  return !!rates && typeof rates.TRY === "number" && rates.TRY > 0;
}
