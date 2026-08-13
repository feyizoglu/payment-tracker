import { useLang } from "@ptracker/shared/i18n";
import { ALLOWED_CURRENCIES, getCurrencySymbol } from "@ptracker/shared/payments";
import type { Team } from "@ptracker/shared/types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text } from "react-native";

import { DateField } from "@/components/ui/date-field";
import { FormScreen } from "@/components/ui/form-screen";
import { MonthField } from "@/components/ui/month-field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth-context";
import { formatDayLong } from "@/lib/calendar";
import { fromIsoDate, toIsoDate } from "@/lib/dates";
import {
  assignableMembers,
  computedInstallment,
  computedTotal,
  emptyPaymentForm,
  paymentFormToRequest,
  validatePaymentForm,
  type PaymentFormState,
} from "@/lib/payment-form";

const currencyOptions: SelectOption[] = ALLOWED_CURRENCIES.map((c) => ({
  value: c,
  label: `${getCurrencySymbol(c)} ${c}`,
}));

function formatAmount(value: number): string {
  if (!value || !Number.isFinite(value)) return "";
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentFormScreen() {
  const { t } = useLang();
  const { api, user } = useAuth();
  const params = useLocalSearchParams<{ date?: string }>();

  const [form, setForm] = useState<PaymentFormState>(() =>
    emptyPaymentForm({ startDate: params.date || toIsoDate(new Date()) })
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Teams are optional context: if the request fails the form still works as a
  // personal payment, so the failure is swallowed rather than blocking the screen.
  useEffect(() => {
    let cancelled = false;
    api
      .get<Team[]>("/api/teams")
      .then((list) => {
        if (!cancelled) setTeams(list ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  function set<K extends keyof PaymentFormState>(field: K, value: PaymentFormState[K]) {
    // Changing the team invalidates the member selection made under the old team.
    setForm((prev) => ({ ...prev, [field]: value, ...(field === "teamId" ? { targetUserId: "" } : {}) }));
  }

  const members = useMemo(
    () => assignableMembers(teams, form.teamId, user?.id),
    [teams, form.teamId, user?.id]
  );

  const isRecurring = form.entryKind === "recurring";

  async function submit() {
    const problem = validatePaymentForm(form, {
      fillRequired: t.fillRequired,
      amountPositive: t.amountPositive,
      installmentsRange: t.installmentsRange,
    });
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { url, body } = paymentFormToRequest(form);
      await api.post(url, body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen
      title={t.addPaymentTitle}
      submitLabel={busy ? t.adding : t.addPayment}
      cancelLabel={t.cancel}
      onSubmit={submit}
      busy={busy}
      error={error}>
      <SegmentedToggle
        label={t.paymentTypeLabel}
        value={form.entryKind}
        options={[
          { value: "installment", label: t.installmentType },
          { value: "recurring", label: t.recurringType },
        ]}
        onChange={(next) => set("entryKind", next as PaymentFormState["entryKind"])}
      />

      <TextField
        label={t.paymentName}
        value={form.name}
        onChangeText={(next) => set("name", next)}
        placeholder={t.paymentNamePlaceholder}
      />

      {isRecurring ? (
        <>
          <SelectField
            label={t.currency}
            value={form.currency}
            options={currencyOptions}
            onChange={(next) => set("currency", next)}
            hint={t.recurringAmountHint}
          />
          <MonthField
            label={t.endMonthOptional}
            value={form.endMonth}
            onChange={(next) => set("endMonth", next)}
            clearLabel={t.noEndDate}
          />
        </>
      ) : (
        <>
          <SegmentedToggle
            label={t.amountMode}
            value={form.inputMode}
            options={[
              { value: "total", label: t.totalMode },
              { value: "installment", label: t.perInstallmentMode },
            ]}
            onChange={(next) => set("inputMode", next as PaymentFormState["inputMode"])}
          />

          <TextField
            label={form.inputMode === "total" ? t.totalAmount : t.perInstallmentAmount}
            value={form.inputMode === "total" ? form.totalAmount : form.installmentAmount}
            onChangeText={(next) => set(form.inputMode === "total" ? "totalAmount" : "installmentAmount", next)}
            placeholder="0.00"
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
          />

          {/* Shows whichever amount the user did not type, like the web form. */}
          <Text className="text-xs text-gray-400">
            {form.inputMode === "total"
              ? `${t.monthlyPayment}: ${getCurrencySymbol(form.currency)}${formatAmount(computedInstallment(form))}`
              : `${t.totalAmount}: ${getCurrencySymbol(form.currency)}${formatAmount(computedTotal(form))}`}
          </Text>
        </>
      )}

      <DateField
        label={t.firstPaymentDate}
        value={form.startDate}
        onChange={(next) => set("startDate", next)}
        hint={t.firstPaymentDateHint}
        formatValue={(value) => formatDayLong(fromIsoDate(value))}
      />

      {teams.length > 0 ? (
        <SelectField
          label={t.addToTeam}
          value={form.teamId}
          options={[{ value: "", label: t.personalOption }, ...teams.map((team) => ({ value: team.id, label: team.name }))]}
          onChange={(next) => set("teamId", next)}
        />
      ) : null}

      {members.length > 0 ? (
        <SelectField
          label={t.addFor}
          value={form.targetUserId}
          options={[{ value: "", label: t.myself }, ...members.map((m) => ({ value: m.userId, label: m.name }))]}
          onChange={(next) => set("targetUserId", next)}
        />
      ) : null}
    </FormScreen>
  );
}
