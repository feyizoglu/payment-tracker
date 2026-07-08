import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { Occurrence, Payment, RecurringPayment } from "@ptracker/shared/types";
import { getOccurrencesForMonth } from "@ptracker/shared/payments";
import { useAuth } from "@/lib/auth-context";
import { markPaidRequest, occurrenceKey } from "@/lib/occurrences";
import { MonthHeader, type PaymentsView } from "@/components/month-header";
import { MonthList } from "@/components/month-list";
import { PaymentsCalendar } from "@/components/payments-calendar";

export default function Payments() {
  const { api, signOut } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [recurrings, setRecurrings] = useState<RecurringPayment[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { year, month } = cursor; // month is 0-indexed
  const [view, setView] = useState<PaymentsView>("list");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([
        api.get<Payment[]>("/api/payments?filter=all"),
        api.get<RecurringPayment[]>("/api/recurring?filter=all"),
      ]);
      setPayments(p);
      setRecurrings(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setReady(true);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const occurrences = useMemo(
    () => getOccurrencesForMonth(payments, recurrings, year, month),
    [payments, recurrings, year, month]
  );

  const shiftMonth = useCallback((delta: number) => {
    setSelectedDay(null);
    // new Date(y, m + delta, 1) normalizes the year rollover; the updater stays
    // pure (no nested setState), safe under StrictMode / concurrent re-renders.
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const onTogglePaid = useCallback(
    async (o: Occurrence) => {
      const key = occurrenceKey(o);
      setBusyKey(key);
      try {
        const req = markPaidRequest(o);
        if (req.method === "PATCH") await api.patch(req.url, req.body);
        else await api.put(req.url, req.body);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Güncellenemedi");
      } finally {
        setBusyKey(null);
      }
    },
    [api, load]
  );

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <MonthHeader
        year={year}
        month={month}
        view={view}
        onPrev={() => shiftMonth(-1)}
        onNext={() => shiftMonth(1)}
        onToggleView={setView}
      />
      {error ? (
        <View className="bg-red-50 p-4">
          <Text className="text-red-700">{error}</Text>
          <Pressable onPress={load} className="mt-2">
            <Text className="text-brand">Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {view === "list" ? (
          <MonthList occurrences={occurrences} busyKey={busyKey} onTogglePaid={onTogglePaid} />
        ) : (
          <PaymentsCalendar
            year={year}
            month={month}
            occurrences={occurrences}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            busyKey={busyKey}
            onTogglePaid={onTogglePaid}
          />
        )}
      </ScrollView>
      <Pressable onPress={signOut} className="border-t border-gray-100 p-4">
        <Text className="text-center text-gray-500">Çıkış yap</Text>
      </Pressable>
    </View>
  );
}
