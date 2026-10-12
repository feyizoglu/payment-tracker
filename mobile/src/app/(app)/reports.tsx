import { useLang } from "@ptracker/shared/i18n";
import {
  endOfDay,
  formatCurrencyTotals,
  payUntilReport,
  rangeReport,
  startOfDay,
  type CurrencyTotals,
} from "@ptracker/shared/reports";
import type { Payment, RecurringPayment } from "@ptracker/shared/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { ReportRow } from "@/components/report-row";
import { DateField } from "@/components/ui/date-field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { TabScreen } from "@/components/tab-screen";
import { useAuth } from "@/lib/auth-context";
import { formatDayLong } from "@/lib/calendar";
import { fromIsoDate } from "@/lib/dates";
import { occurrenceKey } from "@/lib/occurrences";
import { defaultPayUntilDate, defaultRangeDates, type ReportKind } from "@/lib/report-view";

function TotalCard({ label, totals, tone, locale }: { label: string; totals: CurrencyTotals; tone: string; locale: string }) {
  const text = formatCurrencyTotals(totals, locale);
  return (
    <View className={`flex-1 gap-1 rounded-xl p-3 ${tone}`}>
      <Text className="text-xs font-medium text-gray-500">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900">{text || "—"}</Text>
    </View>
  );
}

export default function Reports() {
  const { t, lang } = useLang();
  const { api } = useAuth();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [recurrings, setRecurrings] = useState<RecurringPayment[]>([]);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ReportKind>("range");
  const [range, setRange] = useState(() => defaultRangeDates(new Date()));
  const [payUntilEnd, setPayUntilEnd] = useState(() => defaultPayUntilDate(new Date()));

  const load = useCallback(async () => {
    setError(null);
    try {
      const [paymentList, recurringList] = await Promise.all([
        api.get<Payment[]>("/api/payments?filter=all"),
        api.get<RecurringPayment[]>("/api/recurring?filter=all"),
      ]);
      setPayments(paymentList ?? []);
      setRecurrings(recurringList ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setReady(true);
    }
  }, [api, t.loadFailed]);

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

  const report = useMemo(
    () => rangeReport(payments, recurrings, fromIsoDate(range.start), endOfDay(fromIsoDate(range.end))),
    [payments, recurrings, range.start, range.end]
  );

  const upcoming = useMemo(
    () => payUntilReport(payments, recurrings, startOfDay(new Date()), endOfDay(fromIsoDate(payUntilEnd))),
    [payments, recurrings, payUntilEnd]
  );

  if (!ready) {
    return (
      <TabScreen className="items-center justify-center bg-white">
        <ActivityIndicator />
      </TabScreen>
    );
  }

  const showing = kind === "range" ? report.occurrences : upcoming.occurrences;

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

        <SegmentedToggle
          value={kind}
          options={[
            { value: "range", label: t.dateRangeReport },
            { value: "payUntil", label: t.payUntilTitle },
          ]}
          onChange={(next) => setKind(next as ReportKind)}
        />

        {kind === "range" ? (
          <>
            <DateField
              label={t.startDate}
              value={range.start}
              onChange={(start) => setRange((prev) => ({ ...prev, start }))}
              formatValue={(value) => formatDayLong(fromIsoDate(value), lang)}
            />
            <DateField
              label={t.endDate}
              value={range.end}
              onChange={(end) => setRange((prev) => ({ ...prev, end }))}
              formatValue={(value) => formatDayLong(fromIsoDate(value), lang)}
            />

            <View className="flex-row gap-2">
              <TotalCard label={t.totalDue} totals={report.due} tone="bg-blue-50" locale={t.numberLocale} />
              <TotalCard label={t.paid} totals={report.paid} tone="bg-green-50" locale={t.numberLocale} />
              <TotalCard label={t.remaining} totals={report.remaining} tone="bg-amber-50" locale={t.numberLocale} />
            </View>
          </>
        ) : (
          <>
            <DateField
              label={t.endDate}
              value={payUntilEnd}
              onChange={setPayUntilEnd}
              formatValue={(value) => formatDayLong(fromIsoDate(value), lang)}
            />
            <View className="flex-row gap-2">
              <TotalCard label={t.remaining} totals={upcoming.byCurrency} tone="bg-purple-50" locale={t.numberLocale} />
            </View>
          </>
        )}

        {showing.length === 0 ? (
          <Text className="p-6 text-center text-gray-500">
            {kind === "range" ? t.noPaymentsRange : t.payUntilEmpty}
          </Text>
        ) : (
          <View className="gap-2">
            {showing.map((occurrence, index) => (
              <ReportRow
                key={`${occurrenceKey(occurrence)}-${index}`}
                occurrence={occurrence}
                paidLabel={t.paid}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </TabScreen>
  );
}
