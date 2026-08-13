import { useLang } from "@ptracker/shared/i18n";
import { ALLOWED_CURRENCIES, getCurrencySymbol } from "@ptracker/shared/payments";
import type { RecurringPayment } from "@ptracker/shared/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { DangerLink } from "@/components/ui/danger-link";
import { FormScreen } from "@/components/ui/form-screen";
import { MonthField } from "@/components/ui/month-field";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth-context";
import {
  recurringSeriesState,
  recurringSeriesToBody,
  validateRecurringSeries,
  type RecurringSeriesState,
} from "@/lib/series-form";

const currencyOptions: SelectOption[] = ALLOWED_CURRENCIES.map((c) => ({
  value: c,
  label: `${getCurrencySymbol(c)} ${c}`,
}));

export default function EditRecurringScreen() {
  const { t } = useLang();
  const { api } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [recurring, setRecurring] = useState<RecurringPayment | null>(null);
  const [form, setForm] = useState<RecurringSeriesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same as the installment screen: the list endpoint is the only read surface.
  useEffect(() => {
    let cancelled = false;
    api
      .get<RecurringPayment[]>("/api/recurring?filter=all")
      .then((list) => {
        if (cancelled) return;
        const found = (list ?? []).find((r) => r.id === id) ?? null;
        setRecurring(found);
        setForm(found ? recurringSeriesState(found) : null);
        if (!found) setError(t.loadFailed);
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
  }, [api, id, t.loadFailed]);

  function set<K extends keyof RecurringSeriesState>(field: K, value: RecurringSeriesState[K]) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function submit() {
    if (!form || !recurring) return;
    const problem = validateRecurringSeries(form, {
      fillRequired: t.fillRequired,
      amountPositive: t.amountPositive,
      installmentsRange: t.installmentsRange,
      installmentsBelowPaid: t.installmentsBelowPaid,
      dayRange: t.dayRange,
    });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/recurring/${recurring.id}`, recurringSeriesToBody(form));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!recurring) return;
    Alert.alert(t.editReminder, t.recurringDeleteConfirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: remove },
    ]);
  }

  async function remove() {
    if (!recurring) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/recurring/${recurring.id}`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={t.editReminder}
      submitLabel={busy ? t.saving : t.save}
      cancelLabel={t.cancel}
      onSubmit={submit}
      busy={busy}
      loading={loading}
      error={error}
      footer={recurring ? <DangerLink label={t.delete} onPress={confirmDelete} disabled={busy} /> : null}>
      {form ? (
        <>
          <TextField label={t.paymentName} value={form.name} onChangeText={(next) => set("name", next)} />

          <TextField
            label={t.dayOfMonthLabel}
            value={form.dayOfMonth}
            onChangeText={(next) => set("dayOfMonth", next)}
            numeric
          />

          <SelectField
            label={t.currency}
            value={form.currency}
            options={currencyOptions}
            onChange={(next) => set("currency", next)}
          />

          <MonthField
            label={t.endMonthOptional}
            value={form.endMonth}
            onChange={(next) => set("endMonth", next)}
            clearLabel={t.noEndDate}
          />
        </>
      ) : null}
    </FormScreen>
  );
}
