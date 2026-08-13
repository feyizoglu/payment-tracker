import { describe, it, expect } from "vitest";
import type { Asset, ExchangeRates, Team } from "@/types";
import {
  isGoldType,
  goldUnit,
  formatAmount,
  formatPreferred,
  toUSD,
  fromUSD,
  groupByBank,
  filterAssets,
  assetTotalIn,
  canManageAsset,
  hashColor,
  manualGoldToRates,
  goldPricesInTRY,
} from "@/lib/economy";

// USD per 1 unit — the shape /api/exchange-rates returns.
const rates: ExchangeRates = {
  USD: 1,
  EUR: 1.1,
  GBP: 1.25,
  TRY: 0.025, // 1 TRY = 0.025 USD (40 TRY per USD)
  BILEZIK: 100,
  GRAM_ALTIN: 110,
  CEYREK_ALTIN: 180,
  YARIM_ALTIN: 360,
  TAM_ALTIN: 720,
  fetchedAt: "2026-08-13T10:00:00.000Z",
  goldError: null,
};

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    user_id: "u1",
    team_id: null,
    bank_name: "Garanti",
    currency: "USD",
    amount: 100,
    created_at: "",
    ...over,
  };
}

describe("currency classification", () => {
  it("separates gold types from fiat", () => {
    expect(isGoldType("GRAM_ALTIN")).toBe(true);
    expect(isGoldType("TAM_ALTIN")).toBe(true);
    expect(isGoldType("USD")).toBe(false);
    expect(isGoldType("TRY")).toBe(false);
  });

  it("weighs bracelet and gram gold, counts the coins", () => {
    expect(goldUnit("BILEZIK")).toBe("gr");
    expect(goldUnit("GRAM_ALTIN")).toBe("gr");
    expect(goldUnit("CEYREK_ALTIN")).toBe("adet");
    expect(goldUnit("YARIM_ALTIN")).toBe("adet");
    expect(goldUnit("TAM_ALTIN")).toBe("adet");
  });
});

describe("formatting", () => {
  it("shows gold in its own unit, without forcing decimals", () => {
    expect(formatAmount(12.5, "GRAM_ALTIN", "tr-TR")).toBe("12,5 gr");
    expect(formatAmount(3, "CEYREK_ALTIN", "tr-TR")).toBe("3 adet");
  });

  it("shows fiat with a symbol and two decimals", () => {
    expect(formatAmount(1234.5, "USD", "tr-TR")).toBe("$1.234,50");
    expect(formatAmount(1000, "TRY", "tr-TR")).toBe("₺1.000,00");
  });

  it("formats a converted value in the display currency", () => {
    expect(formatPreferred(1234.567, "EUR", "tr-TR")).toBe("€1.234,57");
  });
});

describe("conversion", () => {
  it("pivots through USD", () => {
    expect(toUSD(100, "USD", rates)).toBe(100);
    expect(toUSD(1000, "TRY", rates)).toBe(25);
    expect(toUSD(2, "GRAM_ALTIN", rates)).toBe(220);
  });

  it("converts USD into the display currency", () => {
    expect(fromUSD(110, "EUR", rates)).toBeCloseTo(100, 10);
    expect(fromUSD(25, "TRY", rates)).toBe(1000);
  });

  it("round-trips a value back to its own currency", () => {
    expect(fromUSD(toUSD(500, "GBP", rates), "GBP", rates)).toBeCloseTo(500, 10);
  });
});

describe("groupByBank", () => {
  it("groups by bank name, preserving first-seen order", () => {
    const grouped = groupByBank([
      asset({ id: "1", bank_name: "Garanti" }),
      asset({ id: "2", bank_name: "Akbank" }),
      asset({ id: "3", bank_name: "Garanti" }),
    ]);
    expect(grouped.map((g) => g.bankName)).toEqual(["Garanti", "Akbank"]);
    expect(grouped[0].assets.map((a) => a.id)).toEqual(["1", "3"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByBank([])).toEqual([]);
  });
});

describe("filterAssets", () => {
  const assets = [
    asset({ id: "1", team_id: null }),
    asset({ id: "2", team_id: "t1" }),
    asset({ id: "3", team_id: "t2" }),
  ];

  it("passes everything through on 'all'", () => {
    expect(filterAssets(assets, "all")).toHaveLength(3);
  });

  it("keeps only team-less assets on 'personal'", () => {
    expect(filterAssets(assets, "personal").map((a) => a.id)).toEqual(["1"]);
  });

  it("keeps one team's assets on a team id", () => {
    expect(filterAssets(assets, "t2").map((a) => a.id)).toEqual(["3"]);
  });
});

describe("assetTotalIn", () => {
  it("sums mixed currencies into the display currency", () => {
    const total = assetTotalIn(
      [asset({ currency: "USD", amount: 100 }), asset({ currency: "TRY", amount: 4000 })],
      "USD",
      rates
    );
    expect(total).toBe(200); // 100 USD + 4000 TRY (=100 USD)
  });

  it("includes gold at its rate when the gold price is available", () => {
    expect(assetTotalIn([asset({ currency: "GRAM_ALTIN", amount: 2 })], "USD", rates)).toBe(220);
  });

  it("skips gold entirely when the gold price failed", () => {
    const broken: ExchangeRates = { ...rates, goldError: "Gold price unavailable" };
    const total = assetTotalIn(
      [asset({ currency: "GRAM_ALTIN", amount: 2 }), asset({ currency: "USD", amount: 50 })],
      "USD",
      broken
    );
    expect(total).toBe(50); // the gold row is excluded, not counted at a stale rate
  });

  it("is null without rates, and zero for an empty list", () => {
    expect(assetTotalIn([asset()], "USD", null)).toBeNull();
    expect(assetTotalIn([], "USD", rates)).toBe(0);
  });
});

describe("canManageAsset", () => {
  const teams: Team[] = [
    {
      id: "t1",
      name: "Home",
      created_by: "u1",
      created_at: "",
      members: [
        { team_id: "t1", user_id: "u1", role: "owner", joined_at: "" },
        { team_id: "t1", user_id: "u2", role: "member", joined_at: "" },
      ],
    },
  ];

  it("lets the owner of the asset manage it", () => {
    expect(canManageAsset(asset({ user_id: "u2" }), "u2", teams)).toBe(true);
  });

  it("lets a team owner manage another member's team asset", () => {
    expect(canManageAsset(asset({ user_id: "u2", team_id: "t1" }), "u1", teams)).toBe(true);
  });

  it("refuses a plain member on someone else's asset", () => {
    expect(canManageAsset(asset({ user_id: "u1", team_id: "t1" }), "u2", teams)).toBe(false);
  });

  it("refuses when the asset is personal and not theirs", () => {
    expect(canManageAsset(asset({ user_id: "u1", team_id: null }), "u2", teams)).toBe(false);
  });

  it("refuses when the signed-in user is unknown", () => {
    expect(canManageAsset(asset({ user_id: "u1" }), undefined, teams)).toBe(false);
  });
});

describe("hashColor", () => {
  it("is deterministic and stays inside the palette", () => {
    const first = hashColor("user-123");
    expect(hashColor("user-123")).toBe(first);
    expect(first).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("manual gold entry", () => {
  it("turns lira prices into USD-per-unit rates and clears the error", () => {
    const broken: ExchangeRates = { ...rates, goldError: "Gold price unavailable" };
    const updated = manualGoldToRates(broken, { GRAM_ALTIN: "4400" }, "2026-08-13T12:00:00.000Z");

    expect(updated.GRAM_ALTIN).toBe(110); // 4400 TRY * 0.025 USD/TRY
    expect(updated.goldError).toBeNull();
    expect(updated.fetchedAt).toBe("2026-08-13T12:00:00.000Z");
  });

  it("accepts a comma decimal separator", () => {
    const updated = manualGoldToRates(rates, { BILEZIK: "4000,5" }, "now");
    expect(updated.BILEZIK).toBeCloseTo(100.0125, 6);
  });

  it("keeps the existing rate for blank, zero, or unparseable entries", () => {
    const updated = manualGoldToRates(
      rates,
      { BILEZIK: "", GRAM_ALTIN: "0", CEYREK_ALTIN: "abc" },
      "now"
    );
    expect(updated.BILEZIK).toBe(rates.BILEZIK);
    expect(updated.GRAM_ALTIN).toBe(rates.GRAM_ALTIN);
    expect(updated.CEYREK_ALTIN).toBe(rates.CEYREK_ALTIN);
  });

  it("does not touch fiat rates", () => {
    const updated = manualGoldToRates(rates, { TAM_ALTIN: "28800" }, "now");
    expect(updated.TRY).toBe(rates.TRY);
    expect(updated.EUR).toBe(rates.EUR);
  });
});

describe("goldPricesInTRY", () => {
  it("back-computes the lira prices behind the current rates", () => {
    expect(goldPricesInTRY(rates).GRAM_ALTIN).toBe(4400); // 110 USD / 0.025
  });

  it("returns zeros when there is no lira rate to divide by", () => {
    const noTry: ExchangeRates = { ...rates, TRY: 0 };
    expect(goldPricesInTRY(noTry).GRAM_ALTIN).toBe(0);
  });

  it("round-trips through manualGoldToRates", () => {
    const prices = goldPricesInTRY(rates);
    const updated = manualGoldToRates(rates, { TAM_ALTIN: String(prices.TAM_ALTIN) }, "now");
    expect(updated.TAM_ALTIN).toBeCloseTo(rates.TAM_ALTIN, 6);
  });
});
