import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { EventDetail, EventExpense } from "@ptracker/shared/types";
import { localeFor, useLang } from "@ptracker/shared/i18n";
import { formatMinor, participantLabel } from "@ptracker/shared/split";
import { Participants } from "@/components/events/participants";
import { SettleUp } from "@/components/events/settle-up";
import { DangerLink } from "@/components/ui/danger-link";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { fromIsoDate } from "@/lib/dates";

type LoadState = { kind: "loading" } | { kind: "ok"; detail: EventDetail } | { kind: "notFound" } | { kind: "error"; message: string };

export default function EventScreen() {
  const { t, lang } = useLang();
  const { api, user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { top } = useSafeAreaInsets();
  const locale = localeFor(lang);

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await api.get<EventDetail>(`/api/events/${id}`);
      setState({ kind: "ok", detail });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setState({ kind: "notFound" });
      else {
        const message = e instanceof Error ? e.message : t.loadFailed;
        setState((prev) => (prev.kind === "ok" ? prev : { kind: "error", message }));
        setActionError(message);
      }
    }
  }, [api, id, t.loadFailed]);

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

  const detail = state.kind === "ok" ? state.detail : null;
  const isOpen = detail?.status === "open";
  const isCreator = detail !== null && detail.created_by === user?.id;
  const nameOf = (pid: string) => {
    const p = detail?.participants.find((x) => x.id === pid);
    return p ? participantLabel(p) : "?";
  };

  async function setStatus(next: "open" | "closed") {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/api/events/${id}`, { status: next });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.updateFailed);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteEvent() {
    if (busy) return;
    Alert.alert(t.deleteEvent, t.eventDeleteConfirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: deleteEvent },
    ]);
  }

  async function deleteEvent() {
    setBusy(true);
    setActionError(null);
    try {
      await api.del(`/api/events/${id}`);
      router.back();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.updateFailed);
      if (e instanceof ApiError && e.status === 409) await load();
      setBusy(false);
    }
  }

  function confirmDeleteExpense(expense: EventExpense) {
    if (busy) return;
    Alert.alert(t.delete, `${t.delete}: ${expense.description}?`, [
      { text: t.cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: () => deleteExpense(expense) },
    ]);
  }

  async function deleteExpense(expense: EventExpense) {
    setBusy(true);
    setActionError(null);
    try {
      await api.del(`/api/events/${id}/expenses/${expense.id}`);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.updateFailed);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View className="flex-row items-center gap-3 border-b border-gray-100 px-4 py-3">
      <Pressable onPress={() => router.back()}>
        <Text className="text-sm text-gray-500">← {t.back}</Text>
      </Pressable>
      <Text className="flex-1 text-base font-semibold text-gray-900" numberOfLines={1}>
        {detail?.name ?? t.events}
      </Text>
      {detail && !isOpen ? (
        <Text className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">{t.closed}</Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: top }}>
      {header}
      {state.kind === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : state.kind === "notFound" ? (
        <View className="flex-1 items-center justify-center gap-3 p-4">
          <Text className="text-sm text-gray-500">{t.eventNotFound}</Text>
          <Pressable onPress={() => router.back()}>
            <Text className="text-brand">{t.back}</Text>
          </Pressable>
        </View>
      ) : state.kind === "error" ? (
        <View className="m-4 rounded-lg bg-red-50 p-4">
          <Text className="text-red-700">{state.message}</Text>
          <Pressable onPress={load} className="mt-2">
            <Text className="text-brand">{t.tryAgain}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 p-4 pb-12"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {state.detail.event_date ? (
            <Text className="text-sm text-gray-400">
              {fromIsoDate(state.detail.event_date).toLocaleDateString(locale)}
            </Text>
          ) : null}

          {isCreator ? (
            <View className="flex-row items-center justify-between">
              <Pressable
                disabled={busy}
                onPress={() => setStatus(isOpen ? "closed" : "open")}
                className={`rounded-lg border border-gray-200 px-3 py-2 ${busy ? "opacity-50" : ""}`}>
                <Text className="text-sm font-medium text-gray-700">{isOpen ? t.closeEvent : t.reopenEvent}</Text>
              </Pressable>
              <DangerLink label={t.deleteEvent} onPress={confirmDeleteEvent} disabled={busy} />
            </View>
          ) : null}

          {actionError ? <Text className="text-sm text-red-600">{actionError}</Text> : null}

          <Participants event={state.detail} editable={isOpen} onChanged={load} />

          <View className="gap-2 rounded-xl border border-gray-100 bg-surface p-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold text-gray-900">{t.expenses}</Text>
              {isOpen ? (
                <Pressable
                  onPress={() => router.push({ pathname: "/event-expense", params: { eventId: id } })}
                  className="rounded-lg bg-brand px-3 py-1.5">
                  <Text className="text-sm font-semibold text-brand-fg">+ {t.addExpense}</Text>
                </Pressable>
              ) : null}
            </View>
            {state.detail.expenses.length === 0 ? <Text className="text-sm text-gray-400">—</Text> : null}
            {state.detail.expenses.map((expense) => (
              <Pressable
                key={expense.id}
                disabled={!isOpen || busy}
                onPress={() =>
                  router.push({ pathname: "/event-expense", params: { eventId: id, expenseId: expense.id } })
                }
                onLongPress={() => confirmDeleteExpense(expense)}
                className="flex-row items-center gap-3 border-t border-gray-100 py-2.5">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                    {expense.description}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    {t.paidBy}: {nameOf(expense.paid_by)} · {fromIsoDate(expense.spent_on).toLocaleDateString(locale)}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-gray-900">
                  {formatMinor(expense.amount_minor, expense.currency, locale)}
                </Text>
              </Pressable>
            ))}
          </View>

          <SettleUp event={state.detail} isOpen={isOpen} onChanged={load} />
        </ScrollView>
      )}
    </View>
  );
}
