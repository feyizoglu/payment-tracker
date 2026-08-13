import { describe, it, expect, vi, beforeEach } from "vitest";

// AsyncStorage is a native module, so it is mocked here: these tests are about the
// fail-soft contract of the cache readers/writers, not about the store itself.
const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import {
  getCachedRates,
  setCachedRates,
  getPreferredCurrency,
  setPreferredCurrency,
} from "./economy-storage";

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("getCachedRates", () => {
  it("returns the parsed rates when the cache is well formed", async () => {
    getItem.mockResolvedValue(JSON.stringify({ USD: 1, TRY: 34, fetchedAt: "2026-01-01T10:00:00Z" }));
    expect(await getCachedRates()).toEqual({ USD: 1, TRY: 34, fetchedAt: "2026-01-01T10:00:00Z" });
  });

  it("returns null when nothing is cached", async () => {
    getItem.mockResolvedValue(null);
    expect(await getCachedRates()).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", async () => {
    getItem.mockResolvedValue("{ half-written");
    expect(await getCachedRates()).toBeNull();
  });

  it("returns null when the pivot USD rate is missing, so conversions never go NaN", async () => {
    getItem.mockResolvedValue(JSON.stringify({ TRY: 34 }));
    expect(await getCachedRates()).toBeNull();
  });

  it("returns null when USD is not a number", async () => {
    getItem.mockResolvedValue(JSON.stringify({ USD: "1", TRY: 34 }));
    expect(await getCachedRates()).toBeNull();
  });

  it("returns null when the read itself rejects", async () => {
    getItem.mockRejectedValue(new Error("storage unavailable"));
    expect(await getCachedRates()).toBeNull();
  });
});

describe("setCachedRates", () => {
  it("writes the rates as JSON", async () => {
    setItem.mockResolvedValue(undefined);
    await setCachedRates({ USD: 1, TRY: 34 } as never);
    expect(setItem).toHaveBeenCalledWith("economy_rates", JSON.stringify({ USD: 1, TRY: 34 }));
  });

  it("swallows a write rejection", async () => {
    setItem.mockRejectedValue(new Error("disk full"));
    await expect(setCachedRates({ USD: 1 } as never)).resolves.toBeUndefined();
  });
});

describe("getPreferredCurrency", () => {
  it("returns a whitelisted stored currency", async () => {
    getItem.mockResolvedValue("EUR");
    expect(await getPreferredCurrency()).toBe("EUR");
  });

  it("returns null for a currency outside the whitelist", async () => {
    getItem.mockResolvedValue("XAU");
    expect(await getPreferredCurrency()).toBeNull();
  });

  it("returns null when nothing is stored", async () => {
    getItem.mockResolvedValue(null);
    expect(await getPreferredCurrency()).toBeNull();
  });

  it("returns null when the read rejects", async () => {
    getItem.mockRejectedValue(new Error("storage unavailable"));
    expect(await getPreferredCurrency()).toBeNull();
  });
});

describe("setPreferredCurrency", () => {
  it("writes the raw currency code", async () => {
    setItem.mockResolvedValue(undefined);
    await setPreferredCurrency("TRY");
    expect(setItem).toHaveBeenCalledWith("economy_preferred_currency", "TRY");
  });

  it("swallows a write rejection", async () => {
    setItem.mockRejectedValue(new Error("disk full"));
    await expect(setPreferredCurrency("USD")).resolves.toBeUndefined();
  });
});
