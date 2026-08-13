import type { Asset, Currency, ExchangeRates, FiatCurrency, GoldType, Team } from "./types";

// Pure economy logic shared by the web page and the mobile Economy tab: currency
// classification, formatting, USD-pivot conversion, grouping, totals, and permissions.
// Extracted from src/app/economy/page.tsx, where it lived inline and untested.

export const FIAT_CURRENCIES: FiatCurrency[] = ["USD", "EUR", "GBP", "TRY"];

export const GOLD_TYPES: { value: GoldType; labelKey: string; unit: "gr" | "adet" }[] = [
  { value: "BILEZIK", labelKey: "goldBilezik", unit: "gr" },
  { value: "GRAM_ALTIN", labelKey: "goldGram", unit: "gr" },
  { value: "CEYREK_ALTIN", labelKey: "goldCeyrek", unit: "adet" },
  { value: "YARIM_ALTIN", labelKey: "goldYarim", unit: "adet" },
  { value: "TAM_ALTIN", labelKey: "goldTam", unit: "adet" },
];

export const FIAT_SYMBOLS: Record<FiatCurrency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
};

export function isGoldType(currency: Currency): currency is GoldType {
  return GOLD_TYPES.some((gold) => gold.value === currency);
}

// Bracelet and gram gold are weighed; the coins are counted.
export function goldUnit(currency: GoldType): "gr" | "adet" {
  return currency === "BILEZIK" || currency === "GRAM_ALTIN" ? "gr" : "adet";
}

// An asset's own amount, in its own unit: "12,5 gr" / "3 adet" / "$1.234,56".
export function formatAmount(amount: number, currency: Currency): string {
  if (isGoldType(currency)) {
    const formatted = amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return `${formatted} ${goldUnit(currency)}`;
  }
  return formatPreferred(amount, currency as FiatCurrency);
}

// A value already converted into the user's display currency — always 2 decimals.
export function formatPreferred(amount: number, currency: FiatCurrency): string {
  const formatted = amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${FIAT_SYMBOLS[currency]}${formatted}`;
}

// Every rate is "USD per 1 unit", so USD is the pivot both directions go through.
export function toUSD(amount: number, currency: Currency, rates: ExchangeRates): number {
  return amount * rates[currency];
}

export function fromUSD(usd: number, target: FiatCurrency, rates: ExchangeRates): number {
  return usd / rates[target];
}

export function groupByBank(assets: Asset[]): { bankName: string; assets: Asset[] }[] {
  const map = new Map<string, Asset[]>();
  for (const asset of assets) {
    const list = map.get(asset.bank_name) ?? [];
    list.push(asset);
    map.set(asset.bank_name, list);
  }
  return Array.from(map.entries()).map(([bankName, grouped]) => ({ bankName, assets: grouped }));
}

// `filter` is "all", "personal", or a team id — the same tokens the filter chips use.
export function filterAssets(assets: Asset[], filter: string): Asset[] {
  if (filter === "all") return assets;
  if (filter === "personal") return assets.filter((asset) => !asset.team_id);
  return assets.filter((asset) => asset.team_id === filter);
}

// Sum of the assets in the display currency, or null when there are no rates yet.
// When the gold price could not be fetched, gold assets are SKIPPED rather than counted
// at a stale or zero rate — an understated total the UI labels is safer than a wrong one.
export function assetTotalIn(
  assets: Asset[],
  preferred: FiatCurrency,
  rates: ExchangeRates | null
): number | null {
  if (!rates) return null;
  return assets.reduce((sum, asset) => {
    if (isGoldType(asset.currency) && rates.goldError) return sum;
    return sum + fromUSD(toUSD(asset.amount, asset.currency, rates), preferred, rates);
  }, 0);
}

// Editable by the asset's owner, or by an owner of the team it belongs to. The API
// enforces the same rule; this only decides whether to show the controls.
export function canManageAsset(asset: Asset, userId: string | undefined, teams: Team[]): boolean {
  if (!userId) return false;
  if (asset.user_id === userId) return true;
  if (!asset.team_id) return false;

  const team = teams.find((candidate) => candidate.id === asset.team_id);
  return team?.members?.some((member) => member.user_id === userId && member.role === "owner") ?? false;
}

const PALETTE = ["#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#10B981", "#EC4899", "#F97316", "#14B8A6"];

// Deterministic avatar colour for users who have not picked one.
export function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(31, hash) + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// Manual gold entry: the user types today's prices in Turkish lira, which become
// USD-per-unit rates like the API's. Blank or non-positive entries keep the existing
// rate. Clearing goldError is what puts gold back into the totals.
export function manualGoldToRates(
  existing: ExchangeRates,
  tryPrices: Partial<Record<GoldType, string>>,
  now: string
): ExchangeRates {
  const usdPerTRY = existing.TRY;
  const updated: ExchangeRates = { ...existing, fetchedAt: now, goldError: null };

  for (const gold of GOLD_TYPES) {
    const raw = tryPrices[gold.value];
    if (raw == null || raw.trim() === "") continue;
    // Accept the comma decimal separator a Turkish keyboard produces.
    const price = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) continue;
    updated[gold.value] = price * usdPerTRY;
  }

  return updated;
}

// The reverse, to seed the manual-entry form with the rates currently in effect.
export function goldPricesInTRY(rates: ExchangeRates): Record<GoldType, number> {
  const prices = {} as Record<GoldType, number>;
  for (const gold of GOLD_TYPES) {
    prices[gold.value] = rates.TRY ? Math.round(rates[gold.value] / rates.TRY) : 0;
  }
  return prices;
}
