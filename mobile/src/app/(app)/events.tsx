import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { EventSummary, SplitEvent } from "@ptracker/shared/types";
import { localeFor, useLang } from "@ptracker/shared/i18n";
import { formatMinor } from "@ptracker/shared/split";
import { TabScreen } from "@/components/tab-screen";
import { PrimaryButton } from "@/components/ui/primary-button";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth-context";
import { fromIsoDate } from "@/lib/dates";

export default function Events() {
  const { t, lang } = useLang();
  const { api } = useAuth();
  const locale = localeFor(lang);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEvents(await api.get<EventSummary[]>("/api/events"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setReady(true);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const event = await api.post<SplitEvent>("/api/events", { name: trimmed });
      setName("");
      router.push({ pathname: "/event/[id]", params: { id: event.id } });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t.updateFailed);
    } finally {
      setCreating(false);
    }
  }

  if (!ready) {
    return (
      <TabScreen className="items-center justify-center bg-surface">
        <ActivityIndicator />
      </TabScreen>
    );
  }

  return (
    <TabScreen>
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-24"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text className="text-xl font-bold text-gray-900">{t.events}</Text>

        <View className="gap-2 rounded-xl border border-gray-100 bg-surface p-3">
          <TextField label={t.eventName} value={name} onChangeText={setName} />
          <PrimaryButton label={t.newEvent} onPress={create} busy={creating} disabled={!name.trim()} />
          {createError ? <Text className="text-sm text-red-600">{createError}</Text> : null}
        </View>

        {error ? (
          <View className="rounded-lg bg-red-50 p-4">
            <Text className="text-red-700">{error}</Text>
            <Pressable onPress={load} className="mt-2">
              <Text className="text-brand">{t.tryAgain}</Text>
            </Pressable>
          </View>
        ) : null}

        {!error && events.length === 0 ? (
          <Text className="py-8 text-center text-sm text-gray-400">{t.noEvents}</Text>
        ) : null}

        {events.map((ev) => (
          <Pressable
            key={ev.id}
            onPress={() => router.push({ pathname: "/event/[id]", params: { id: ev.id } })}
            className="rounded-xl border border-gray-100 bg-surface p-3">
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text className="font-semibold text-gray-900" numberOfLines={1}>
                  {ev.name}
                </Text>
                {ev.event_date ? (
                  <Text className="mt-0.5 text-xs text-gray-400">
                    {fromIsoDate(ev.event_date).toLocaleDateString(locale)}
                  </Text>
                ) : null}
              </View>
              {ev.status === "closed" ? (
                <Text className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                  {t.closed}
                </Text>
              ) : null}
            </View>
            {Object.entries(ev.my_balance).map(([currency, v]) =>
              v === 0 ? null : (
                <Text
                  key={currency}
                  className={`mt-1 text-sm font-medium ${v > 0 ? "text-green-600" : "text-red-600"}`}>
                  {v > 0 ? t.youAreOwed : t.youOwe} {formatMinor(Math.abs(v), currency, locale)}
                </Text>
              )
            )}
          </Pressable>
        ))}
      </ScrollView>
    </TabScreen>
  );
}
