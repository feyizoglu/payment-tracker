import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import type { Occurrence, Payment, RecurringPayment, Team } from "@ptracker/shared/types";
import { useLang } from "@ptracker/shared/i18n";
import { getOccurrencesForMonth } from "@ptracker/shared/payments";
import { TabScreen } from "@/components/tab-screen";
import { useAuth } from "@/lib/auth-context";
import { toIsoDate } from "@/lib/dates";
import { occurrenceEditRoute, seriesEditRoute } from "@/lib/occurrence-edit";
import { markPaidRequest, occurrenceKey } from "@/lib/occurrences";
import { buildPeople } from "@/lib/people";
import { MonthHeader, type PaymentsView } from "@/components/month-header";
import { MonthList } from "@/components/month-list";
import { PaymentsCalendar } from "@/components/payments-calendar";

export default function Payments() {
  const { t } = useLang();
  const { api, user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [recurrings, setRecurrings] = useState<RecurringPayment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { year, month } = cursor; // month is 0-indexed
  const [view, setView] = useState<PaymentsView>("list");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Set by a tapped reminder notification ("yyyy-MM").
  const { month: monthParam, tap } = useLocalSearchParams<{ month?: string; tap?: string }>();
  useEffect(() => {
    const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
    if (!match) return;
    setSelectedDay(null);
    setCursor({ year: Number(match[1]), month: Number(match[2]) - 1 });
  }, [monthParam, tap]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r, tm] = await Promise.all([
        api.get<Payment[]>("/api/payments?filter=all"),
        api.get<RecurringPayment[]>("/api/recurring?filter=all"),
        // Only tints the rows; a failure here must not hide the payments.
        api.get<Team[]>("/api/teams").catch(() => [] as Team[]),
      ]);
      setPayments(p);
      setRecurrings(r);
      setTeams(tm);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setReady(true);
    }
  }, [api]);

  // Reloads on mount and every time a form modal closes and this tab regains focus,
  // which is how edits made in those modals show up here. Same full-refetch approach
  // as mark-paid — no optimistic state to keep in sync.
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

  const people = useMemo(() => buildPeople(teams, user), [teams, user]);

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
        setError(e instanceof Error ? e.message : t.updateFailed);
      } finally {
        setBusyKey(null);
      }
    },
    [api, load]
  );

  const onEdit = useCallback((o: Occurrence) => {
    router.push(occurrenceEditRoute(o, toIsoDate(o.dueDate)));
  }, []);

  const onEditSeries = useCallback((o: Occurrence) => {
    router.push(seriesEditRoute(o));
  }, []);

  // A new payment defaults to the day the user has selected in the calendar.
  const onAdd = useCallback(() => {
    router.push({
      pathname: "/payment-form",
      params: selectedDay ? { date: toIsoDate(selectedDay) } : {},
    });
  }, [selectedDay]);

  if (!ready) {
    return (
      <TabScreen className="items-center justify-center bg-surface">
        <ActivityIndicator />
      </TabScreen>
    );
  }

  return (
    <TabScreen>
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
            <Text className="text-brand">{t.tryAgain}</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {view === "list" ? (
          <MonthList
            occurrences={occurrences}
            people={people}
            busyKey={busyKey}
            onTogglePaid={onTogglePaid}
            onEdit={onEdit}
            onEditSeries={onEditSeries}
          />
        ) : (
          <PaymentsCalendar
            year={year}
            month={month}
            occurrences={occurrences}
            people={people}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            busyKey={busyKey}
            onTogglePaid={onTogglePaid}
            onEdit={onEdit}
            onEditSeries={onEditSeries}
          />
        )}
      </ScrollView>
      <Pressable
        onPress={onAdd}
        className="absolute bottom-20 right-5 h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg">
        <Text className="text-2xl leading-7 text-brand-fg">+</Text>
      </Pressable>
    </TabScreen>
  );
}
