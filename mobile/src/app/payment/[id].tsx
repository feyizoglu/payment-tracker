import { useLang } from "@ptracker/shared/i18n";
import { ALLOWED_CURRENCIES, getCurrencySymbol } from "@ptracker/shared/payments";
import type { Payment } from "@ptracker/shared/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

import { DangerLink } from "@/components/ui/danger-link";
import { FormScreen } from "@/components/ui/form-screen";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth-context";
import {
  installmentSeriesState,
  installmentSeriesToBody,
  validateInstallmentSeries,
  type InstallmentSeriesState,
} from "@/lib/series-form";

const currencyOptions: SelectOption[] = ALLOWED_CURRENCIES.map((c) => ({
  value: c,
  label: `${getCurrencySymbol(c)} ${c}`,
}));

export default function EditPaymentScreen() {
  const { t } = useLang();
  const { api } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [form, setForm] = useState<InstallmentSeriesState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // There is no GET /api/payments/{id}; the list endpoint is the only read surface,
  // so the series is picked out of it by id (same call the Payments tab makes).
  useEffect(() => {
    let cancelled = false;
    api
      .get<Payment[]>("/api/payments?filter=all")
      .then((list) => {
        if (cancelled) return;
        const found = (list ?? []).find((p) => p.id === id) ?? null;
        setPayment(found);
        setForm(found ? installmentSeriesState(found) : null);
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

  function set<K extends keyof InstallmentSeriesState>(field: K, value: InstallmentSeriesState[K]) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function submit() {
    if (!form || !payment) return;
    const problem = validateInstallmentSeries(form, payment.paid_installments, {
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
      await api.patch(`/api/payments/${payment.id}`, installmentSeriesToBody(form));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!payment) return;
    // Deletes the whole series, not one installment — the copy says so explicitly.
    Alert.alert(t.editPayment, t.paymentDeleteConfirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: remove },
    ]);
  }

  async function remove() {
    if (!payment) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/payments/${payment.id}`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={t.editPayment}
      submitLabel={busy ? t.saving : t.save}
      cancelLabel={t.cancel}
      onSubmit={submit}
      busy={busy}
      loading={loading}
      error={error}
      footer={payment ? <DangerLink label={t.delete} onPress={confirmDelete} disabled={busy} /> : null}>
      {form ? (
        <>
          <TextField label={t.paymentName} value={form.name} onChangeText={(next) => set("name", next)} />

          <TextField
            label={t.totalAmount}
            value={form.amount}
            onChangeText={(next) => set("amount", next)}
            numeric
          />

          <SelectField
            label={t.currency}
            value={form.currency}
            options={currencyOptions}
            onChange={(next) => set("currency", next)}
          />

          <TextField
            label={t.numberOfInstallments}
            value={form.totalInstallments}
            onChangeText={(next) => set("totalInstallments", next)}
            numeric
            hint={`${t.paid}: ${payment?.paid_installments ?? 0}`}
          />
        </>
      ) : null}
    </FormScreen>
  );
}
