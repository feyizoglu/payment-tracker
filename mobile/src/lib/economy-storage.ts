import AsyncStorage from "@react-native-async-storage/async-storage";
import { FIAT_CURRENCIES } from "@ptracker/shared/economy";
import type { ExchangeRates, FiatCurrency } from "@ptracker/shared/types";

// Local cache for the economy screen, mirroring what the web page keeps in
// localStorage: the last fetched rates and the chosen display currency. Rates are NOT
// secrets, so this uses AsyncStorage rather than the secure store that holds the token.
//
// Every read is fail-soft: a corrupt or half-written cache must never keep the screen
// from opening — the user can always press Refresh.

const RATES_KEY = "economy_rates";
const PREFERRED_CURRENCY_KEY = "economy_preferred_currency";

export async function getCachedRates(): Promise<ExchangeRates | null> {
  try {
    const raw = await AsyncStorage.getItem(RATES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExchangeRates;
    // A cache written by an older shape could be missing the pivot rate, which would
    // make every conversion NaN. Treat that as no cache at all.
    return typeof parsed?.USD === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export async function setCachedRates(rates: ExchangeRates): Promise<void> {
  try {
    await AsyncStorage.setItem(RATES_KEY, JSON.stringify(rates));
  } catch {
    // A failed write only costs a refresh on next launch.
  }
}

export async function getPreferredCurrency(): Promise<FiatCurrency | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFERRED_CURRENCY_KEY);
    return raw && (FIAT_CURRENCIES as string[]).includes(raw) ? (raw as FiatCurrency) : null;
  } catch {
    return null;
  }
}

export async function setPreferredCurrency(currency: FiatCurrency): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERRED_CURRENCY_KEY, currency);
  } catch {
    // Non-fatal: the choice simply does not survive a restart.
  }
}
