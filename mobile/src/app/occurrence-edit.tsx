import { decideEditSubmit } from "@ptracker/shared/edit-occurrence";
import { useLang } from "@ptracker/shared/i18n";
import {
  ALLOWED_CURRENCIES,
  getCurrencySymbol,
  getOccurrencesForMonth,
  isPureDayChange,
} from "@ptracker/shared/payments";
import type { Occurrence, Payment, RecurringPayment } from "@ptracker/shared/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text } from "react-native";

import { AmountLines } from "@/components/ui/amount-lines";
import { DateField } from "@/components/ui/date-field";
import { FormScreen } from "@/components/ui/form-screen";
import { RadioGroup } from "@/components/ui/radio-group";
import { type SelectOption } from "@/components/ui/select-field";
import { useAuth } from "@/lib/auth-context";
import { formatDayLong } from "@/lib/calendar";
import { fromIsoDate, toIsoDate } from "@/lib/dates";
import {
  findOccurrence,
  initialAmountLines,
  parseAmountLines,
  parseOccurrenceRef,
  type AmountLine,
} from "@/lib/occurrence-edit";

const currencyOptions: SelectOption[] = ALLOWED_CURRENCIES.map((c) => ({
  value: c,
  label: `${getCurrencySymbol(c)} ${c}`,
}));

export default function OccurrenceEditScreen() {
  const { t } = useLang();
  const { api } = useAuth();
  const params = useLocalSearchParams<{
    kind?: string;
    sourceId?: string;
    installmentIndex?: string;
    period?: string;
    dueDate?: string; // 'yyyy-MM-dd' — identifies which month to rebuild
  }>();

  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [initialDate, setInitialDate] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<AmountLine[]>([]);
  const [scope, setScope] = useState<"one" | "forward">("one");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The occurrence is rebuilt from the series rather than passed through the route:
  // it is derived data (getOccurrencesForMonth applies overrides and day changes), so
  // re-deriving it keeps the screen honest about what is actually stored.
  useEffect(() => {
    let cancelled = false;
    const ref = parseOccurrenceRef(params);
    const anchor = params.dueDate ? fromIsoDate(params.dueDate) : null;

    if (!ref || !anchor) {
      setError(t.loadFailed);
      setLoading(false);
      return;
    }

    Promise.all([
      api.get<Payment[]>("/api/payments?filter=all"),
      api.get<RecurringPayment[]>("/api/recurring?filter=all"),
    ])
      .then(([payments, recurrings]) => {
        if (cancelled) return;
        const monthly = getOccurrencesForMonth(
          payments ?? [],
          recurrings ?? [],
          anchor.getFullYear(),
          anchor.getMonth()
        );
        const found = findOccurrence(monthly, ref);
        if (!found) {
          setError(t.loadFailed);
          return;
        }
        const iso = toIsoDate(found.dueDate);
        setOccurrence(found);
        setInitialDate(iso);
        setDate(iso);
        setLines(initialAmountLines(found, payments ?? [], recurrings ?? []));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Route params are stable for the life of the screen; re-running on every render
    // of the params object would refetch endlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, params.kind, params.sourceId, params.installmentIndex, params.period, params.dueDate]);

  const isRecurring = occurrence?.kind === "recurring";
  // The scope question only makes sense for a day move inside the same month; any
  // other date edit is inherently a single-occurrence override.
  const showScope = !!occurrence && isPureDayChange(date, initialDate);

  async function submit(reset: boolean) {
    if (!occurrence) return;

    const amounts = reset ? [] : parseAmountLines(lines);
    if (amounts === null) {
      setError(t.amountPositive);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { url, body } = decideEditSubmit({ occurrence, reset, scope, date, initialDate, amounts });
      await api.put(url, body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={isRecurring ? t.editReminder : t.editInstallment}
      submitLabel={busy ? t.saving : t.save}
      cancelLabel={t.cancel}
      onSubmit={() => submit(false)}
      busy={busy}
      loading={loading}
      error={error}
      footer={
        occurrence ? (
          <Pressable className={`py-2 ${busy ? "opacity-50" : ""}`} disabled={busy} onPress={() => submit(true)}>
            <Text className="text-center text-sm text-gray-500">
              {isRecurring ? t.resetDay : t.resetToDefault}
            </Text>
          </Pressable>
        ) : null
      }>
      {occurrence ? (
        <>
          <Text className="text-base font-semibold text-gray-900">{occurrence.name}</Text>

          <DateField
            label={t.installmentDate}
            value={date}
            onChange={setDate}
            formatValue={(value) => formatDayLong(fromIsoDate(value))}
          />

          {showScope ? (
            <RadioGroup
              label={t.editScopeLabel}
              value={scope}
              options={[
                { value: "one", label: t.scopeThisOnly },
                { value: "forward", label: isRecurring ? t.scopeForwardRecurring : t.scopeForwardInstallment },
              ]}
              onChange={(next) => setScope(next as "one" | "forward")}
            />
          ) : null}

          <AmountLines
            label={t.amounts}
            lines={lines}
            currencyOptions={currencyOptions}
            onChange={setLines}
            addLabel={t.addCurrency}
          />
        </>
      ) : null}
    </FormScreen>
  );
}
