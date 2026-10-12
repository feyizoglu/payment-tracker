import { FIAT_CURRENCIES, assetTotalIn, filterAssets, formatPreferred, groupByBank } from "@ptracker/shared/economy";
import { useLang } from "@ptracker/shared/i18n";
import type { Asset, ExchangeRates, FiatCurrency, Team } from "@ptracker/shared/types";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { BankGroup } from "@/components/bank-group";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { TabScreen } from "@/components/tab-screen";
import { useAuth } from "@/lib/auth-context";
import { EXCHANGE_RATES_PATH, ratesBanner, restoredRatesStatus, type RatesStatus } from "@/lib/economy-rates";
import {
  getCachedRates,
  getPreferredCurrency,
  setCachedRates,
  setPreferredCurrency,
} from "@/lib/economy-storage";

export default function Economy() {
  const { t } = useLang();
  const { api, user } = useAuth();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [ratesStatus, setRatesStatus] = useState<RatesStatus>("idle");
  const [ratesLoading, setRatesLoading] = useState(false);
  const [preferred, setPreferred] = useState<FiatCurrency>("USD");
  const [activeFilter, setActiveFilter] = useState("all");
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [assetList, teamList] = await Promise.all([
        api.get<Asset[]>("/api/assets"),
        api.get<Team[]>("/api/teams"),
      ]);
      setAssets(assetList ?? []);
      setTeams(teamList ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setReady(true);
    }
  }, [api, t.loadFailed]);

  // Rates come from the cache on open — like the web page, they are never auto-fetched,
  // so an offline launch still shows a total instead of a dash. Re-read on every focus
  // so a manual gold entry made in the modal shows up here.
  const restoreCached = useCallback(async () => {
    const [cached, saved] = await Promise.all([getCachedRates(), getPreferredCurrency()]);
    if (cached) {
      setRates(cached);
      setRatesStatus(restoredRatesStatus);
    }
    if (saved) setPreferred(saved);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      restoreCached();
    }, [load, restoreCached])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const refreshRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const fresh = await api.get<ExchangeRates>(EXCHANGE_RATES_PATH);
      setRates(fresh);
      setRatesStatus("ok");
      await setCachedRates(fresh);
    } catch {
      // Keep whatever rates are on screen; the banner says they are not current.
      setRatesStatus("error");
    } finally {
      setRatesLoading(false);
    }
  }, [api]);

  const choosePreferred = useCallback(async (next: FiatCurrency) => {
    setPreferred(next);
    await setPreferredCurrency(next);
  }, []);

  const visible = useMemo(() => filterAssets(assets, activeFilter), [assets, activeFilter]);
  const total = useMemo(() => assetTotalIn(visible, preferred, rates), [visible, preferred, rates]);
  const groups = useMemo(() => groupByBank(visible), [visible]);
  const banner = ratesBanner(rates, ratesStatus);

  if (!ready) {
    return (
      <TabScreen className="items-center justify-center bg-white">
        <ActivityIndicator />
      </TabScreen>
    );
  }

  return (
    <TabScreen>
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {error ? (
          <View className="rounded-lg bg-red-50 p-3">
            <Text className="text-red-700">{error}</Text>
            <Pressable onPress={load} className="mt-2">
              <Text className="text-brand">{t.tryAgain}</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="gap-2 rounded-xl bg-emerald-50 p-4">
          <Text className="text-xs font-medium text-emerald-700">{t.totalAssets}</Text>
          <Text className="text-3xl font-semibold text-emerald-900">
            {total == null ? "—" : formatPreferred(total, preferred, t.numberLocale)}
          </Text>

          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-emerald-700">
              {banner.kind === "updated"
                ? `${t.ratesLastUpdated} ${banner.time}`
                : banner.kind === "error"
                  ? t.ratesError
                  : t.refreshRates}
            </Text>
            <Pressable onPress={refreshRates} disabled={ratesLoading} className={ratesLoading ? "opacity-50" : ""}>
              {ratesLoading ? <ActivityIndicator size="small" /> : <Text className="text-brand">↻ {t.refreshRates}</Text>}
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="flex-1 text-xs text-amber-700">{banner.goldError ? t.goldError : ""}</Text>
            <Pressable onPress={() => router.push("/manual-gold")}>
              <Text className="text-amber-700">✎ {t.enterGoldManually}</Text>
            </Pressable>
          </View>
        </View>

        <SegmentedToggle
          value={preferred}
          options={FIAT_CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
          onChange={(next) => choosePreferred(next as FiatCurrency)}
        />

        {teams.length > 0 ? (
          <SegmentedToggle
            value={activeFilter}
            options={[
              { value: "all", label: t.all },
              { value: "personal", label: t.personal },
              ...teams.map((team) => ({ value: team.id, label: team.name })),
            ]}
            onChange={setActiveFilter}
          />
        ) : null}

        {groups.length === 0 ? (
          <View className="items-center gap-1 p-6">
            <Text className="text-gray-500">{t.noAssets}</Text>
            <Text className="text-xs text-gray-400">{t.noAssetsHint}</Text>
          </View>
        ) : (
          groups.map((group) => (
            <BankGroup
              key={group.bankName}
              bankName={group.bankName}
              assets={group.assets}
              rates={rates}
              preferredCurrency={preferred}
              currentUserId={user?.id}
              teams={teams}
              accountsLabel={t.accountsCount.replace("{count}", String(group.assets.length))}
              goldErrorLabel={t.goldError}
              onEdit={(asset) => router.push({ pathname: "/asset/[id]", params: { id: asset.id } })}
              onAdd={(bankName) => router.push({ pathname: "/asset-form", params: { bankName } })}
            />
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push("/asset-form")}
        className="absolute bottom-20 right-5 h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg">
        <Text className="text-2xl leading-7 text-brand-fg">+</Text>
      </Pressable>
    </TabScreen>
  );
}
