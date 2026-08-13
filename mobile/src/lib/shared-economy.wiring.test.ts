import { describe, it, expect } from "vitest";
import {
  FIAT_CURRENCIES,
  FIAT_SYMBOLS,
  GOLD_TYPES,
  isGoldType,
  toUSD,
  fromUSD,
  groupByBank,
} from "@ptracker/shared/economy";

// Proves the shared economy module resolves through the mobile toolchain via the
// @ptracker/shared local package — economy.tsx, asset-row.tsx, bank-group.tsx and
// economy-storage.ts all import it. The maths itself is covered on the shared side;
// here we only assert the surface arrives intact across the toolchain boundary.
describe("shared/economy wiring (mobile)", () => {
  it("exposes the fiat whitelist the storage layer validates against", () => {
    expect(FIAT_CURRENCIES).toEqual(["USD", "EUR", "GBP", "TRY"]);
  });

  it("exposes a symbol for every whitelisted fiat currency", () => {
    for (const currency of FIAT_CURRENCIES) {
      expect(typeof FIAT_SYMBOLS[currency]).toBe("string");
    }
  });

  it("exposes the gold type table", () => {
    expect(GOLD_TYPES.length).toBeGreaterThan(0);
  });

  it("exposes the helpers the screen calls", () => {
    expect(typeof isGoldType).toBe("function");
    expect(typeof toUSD).toBe("function");
    expect(typeof fromUSD).toBe("function");
    expect(typeof groupByBank).toBe("function");
  });
});
