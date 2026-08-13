import { GOLD_TYPES, goldPricesInTRY, manualGoldToRates } from "@ptracker/shared/economy";
import { useLang } from "@ptracker/shared/i18n";
import type { ExchangeRates, GoldType } from "@ptracker/shared/types";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { FormScreen } from "@/components/ui/form-screen";
import { TextField } from "@/components/ui/text-field";
import { canEnterGoldManually } from "@/lib/economy-rates";
import { getCachedRates, setCachedRates } from "@/lib/economy-storage";

// Escape hatch for when the gold price feed is down: the user types today's prices in
// lira and the app converts them into the same USD-per-unit rates the API returns.
export default function ManualGoldScreen() {
  const { t } = useLang();

  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [values, setValues] = useState<Partial<Record<GoldType, string>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reads the cache directly rather than taking rates through the route: this screen is
  // the only writer besides the refresh button, so the cache is the source of truth.
  useEffect(() => {
    let cancelled = false;
    getCachedRates()
      .then((cached) => {
        if (cancelled) return;
        setRates(cached);
        if (cached && canEnterGoldManually(cached)) {
          const prices = goldPricesInTRY(cached);
          setValues(
            Object.fromEntries(
              GOLD_TYPES.map((gold) => [gold.value, prices[gold.value] ? String(prices[gold.value]) : ""])
            ) as Partial<Record<GoldType, string>>
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const usable = canEnterGoldManually(rates);

  async function submit() {
    if (!rates || !usable) return;
    setBusy(true);
    setError(null);
    try {
      await setCachedRates(manualGoldToRates(rates, values, new Date().toISOString()));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={t.manualGoldTitle}
      submitLabel={t.manualGoldApply}
      cancelLabel={t.cancel}
      onSubmit={submit}
      busy={busy}
      loading={loading}
      error={error}>
      {usable ? (
        <>
          <Text className="text-xs text-gray-500">{t.manualGoldDesc}</Text>
          {GOLD_TYPES.map((gold) => (
            <TextField
              key={gold.value}
              label={t[gold.labelKey as keyof typeof t] as string}
              value={values[gold.value] ?? ""}
              onChangeText={(next) => setValues((prev) => ({ ...prev, [gold.value]: next }))}
              placeholder="₺0"
              numeric
            />
          ))}
        </>
      ) : (
        <Text className="text-sm text-amber-700">{t.manualGoldNoTRY}</Text>
      )}
    </FormScreen>
  );
}
