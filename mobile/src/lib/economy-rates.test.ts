import { describe, it, expect } from "vitest";
import type { ExchangeRates } from "@ptracker/shared/types";
import { formatFetchedAt, ratesBanner, canEnterGoldManually } from "@/lib/economy-rates";

function makeRates(over: Partial<ExchangeRates> = {}): ExchangeRates {
  return {
    USD: 1,
    EUR: 1.1,
    GBP: 1.25,
    TRY: 0.025,
    BILEZIK: 100,
    GRAM_ALTIN: 110,
    CEYREK_ALTIN: 180,
    YARIM_ALTIN: 360,
    TAM_ALTIN: 720,
    fetchedAt: new Date(2026, 7, 13, 14, 5).toISOString(),
    goldError: null,
    ...over,
  };
}

describe("formatFetchedAt", () => {
  it("shows local hours and minutes, zero-padded", () => {
    expect(formatFetchedAt(new Date(2026, 7, 13, 14, 5).toISOString())).toBe("14:05");
    expect(formatFetchedAt(new Date(2026, 7, 13, 9, 0).toISOString())).toBe("09:00");
  });

  it("returns null instead of 'Invalid Date' for missing or bad input", () => {
    expect(formatFetchedAt(undefined)).toBeNull();
    expect(formatFetchedAt("")).toBeNull();
    expect(formatFetchedAt("not-a-date")).toBeNull();
  });
});

describe("ratesBanner", () => {
  it("asks for a refresh when there are no rates", () => {
    expect(ratesBanner(null, "idle")).toEqual({ kind: "never" });
  });

  it("shows the fetch time once rates exist", () => {
    expect(ratesBanner(makeRates(), "ok")).toEqual({ kind: "updated", time: "14:05", goldError: undefined });
  });

  it("reports the error even when stale rates are still on screen", () => {
    expect(ratesBanner(makeRates(), "error")).toEqual({ kind: "error", goldError: undefined });
  });

  it("surfaces a gold failure alongside a successful fiat fetch", () => {
    const banner = ratesBanner(makeRates({ goldError: "Gold price unavailable" }), "ok");
    expect(banner).toEqual({ kind: "updated", time: "14:05", goldError: "Gold price unavailable" });
  });

  it("falls back to 'never' when the timestamp is unusable", () => {
    expect(ratesBanner(makeRates({ fetchedAt: "garbage" }), "ok")).toEqual({
      kind: "never",
      goldError: undefined,
    });
  });
});

describe("canEnterGoldManually", () => {
  it("needs a positive lira rate to convert with", () => {
    expect(canEnterGoldManually(makeRates())).toBe(true);
    expect(canEnterGoldManually(makeRates({ TRY: 0 }))).toBe(false);
    expect(canEnterGoldManually(null)).toBe(false);
  });
});
