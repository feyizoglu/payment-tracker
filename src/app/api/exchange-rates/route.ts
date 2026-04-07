import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Parse Turkish number format: "6.121,08" → 6121.08
function parseTRY(str: string): number {
  return parseFloat(str.replace(/\./g, "").replace(",", "."));
}

export async function GET() {
  try {
    // 1. Fetch fiat exchange rates (Frankfurter / ECB, no key needed)
    const fxRes = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,TRY",
      { cache: "no-store" }
    );
    if (!fxRes.ok) throw new Error(`Currency API error: ${fxRes.status}`);
    const fxData = await fxRes.json();
    // fxData.rates: { EUR: 0.91, GBP: 0.77, TRY: 33.5 }
    // 1 USD = fxData.rates.X  →  1 X = (1 / fxData.rates.X) USD
    const usdPerTRY = 1 / fxData.rates.TRY;

    // 2. Fetch Turkish gold prices from Harem Altın via RapidAPI
    let goldError: string | null = null;
    let goldRates = {
      BILEZIK: 0,
      GRAM_ALTIN: 0,
      CEYREK_ALTIN: 0,
      YARIM_ALTIN: 0,
      TAM_ALTIN: 0,
    };

    try {
      const apiKey = process.env.RAPIDAPI_HAREM_ALTIN_KEY;
      if (!apiKey) throw new Error("RAPIDAPI_HAREM_ALTIN_KEY not configured");

      const goldRes = await fetch(
        "https://harem-altin-live-gold-price-data.p.rapidapi.com/harem_altin/prices/23b4c2fb31a242d1eebc0df9b9b65e5e",
        {
          headers: {
            "Content-Type": "application/json",
            "x-rapidapi-host": "harem-altin-live-gold-price-data.p.rapidapi.com",
            "x-rapidapi-key": apiKey,
          },
          cache: "no-store",
        }
      );

      if (!goldRes.ok) throw new Error(`Gold API error: ${goldRes.status}`);
      const goldData = await goldRes.json();

      if (!goldData.success || !Array.isArray(goldData.data)) {
        throw new Error("Unexpected gold API response");
      }

      const byKey: Record<string, string> = {};
      for (const item of goldData.data) {
        byKey[item.key] = item.buy;
      }

      // TRY per unit → USD per unit
      const toUSD = (tryPrice: number) => tryPrice * usdPerTRY;

      goldRates = {
        BILEZIK: toUSD(parseTRY(byKey["22 AYAR"] ?? "0")),       // TRY per gram
        GRAM_ALTIN: toUSD(parseTRY(byKey["GRAM ALTIN"] ?? "0")), // TRY per gram
        CEYREK_ALTIN: toUSD(parseTRY(byKey["ESKİ ÇEYREK"] ?? "0")), // TRY per piece
        YARIM_ALTIN: toUSD(parseTRY(byKey["ESKİ YARIM"] ?? "0")),   // TRY per piece
        TAM_ALTIN: toUSD(parseTRY(byKey["ESKİ ATA"] ?? "0")),       // TRY per piece
      };
    } catch (e: any) {
      goldError = e?.message ?? "Gold price unavailable";
    }

    return NextResponse.json({
      USD: 1,
      EUR: 1 / fxData.rates.EUR,
      GBP: 1 / fxData.rates.GBP,
      TRY: usdPerTRY,
      ...goldRates,
      fetchedAt: new Date().toISOString(),
      goldError,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
