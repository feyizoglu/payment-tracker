import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { format } from "date-fns";
import type { EventDetail } from "@ptracker/shared/types";
import { localeFor, useLang } from "@ptracker/shared/i18n";
import { ALLOWED_CURRENCIES, getCurrencySymbol } from "@ptracker/shared/payments";
import { formatMinor, participantLabel } from "@ptracker/shared/split";
import { DateField } from "@/components/ui/date-field";
import { Field, inputBoxClass } from "@/components/ui/field";
import { FormScreen } from "@/components/ui/form-screen";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth-context";
import {
  emptyExpenseForm,
  expenseFormFromExpense,
  expenseFormToBody,
  remainingMinor,
  type ExpenseForm,
} from "@/lib/event-forms";

type FieldError = "description" | "amount" | "split";

const currencyOptions: SelectOption[] = ALLOWED_CURRENCIES.map((c) => ({
  value: c,
  label: `${getCurrencySymbol(c)} ${c}`,
}));

export default function EventExpenseScreen() {
  const { t, lang } = useLang();
  const { api, user } = useAuth();
  const { eventId, expenseId } = useLocalSearchParams<{ eventId: string; expenseId?: string }>();
  const locale = localeFor(lang);

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [form, setForm] = useState<ExpenseForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let cancelled = false;
    api
      .get<EventDetail>(`/api/events/${eventId}`)
      .then((detail) => {
        if (cancelled) return;
        setEvent(detail);
        if (detail.status === "closed") {
          setError(tRef.current.eventIsClosed);
          return;
        }
        if (expenseId) {
          const expense = detail.expenses.find((x) => x.id === expenseId);
          if (expense) setForm((prev) => prev ?? expenseFormFromExpense(expense, detail.participants));
          else setError(tRef.current.loadFailed);
        } else {
          const me = detail.participants.find((p) => p.user_id === userIdRef.current)?.id ?? null;
          setForm((prev) => prev ?? emptyExpenseForm(detail.participants, me, format(new Date(), "yyyy-MM-dd")));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : tRef.current.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, eventId, expenseId]);

  function set<K extends keyof ExpenseForm>(field: K, value: ExpenseForm[K]) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function toggle(id: string) {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            selected: prev.selected.includes(id) ? prev.selected.filter((x) => x !== id) : [...prev.selected, id],
          }
        : prev
    );
  }

  async function submit() {
    if (!form || !event || busy || event.status === "closed") return;
    const result = expenseFormToBody(form, event.participants);
    if (!result.ok) {
      setFieldError(result.field);
      return;
    }
    setFieldError(null);
    setBusy(true);
    setError(null);
    try {
      if (expenseId) await api.put(`/api/events/${eventId}/expenses/${expenseId}`, result.body);
      else await api.post(`/api/events/${eventId}/expenses`, result.body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
      setBusy(false);
    }
  }

  const participantOptions: SelectOption[] = (event?.participants ?? []).map((p) => ({
    value: p.id,
    label: participantLabel(p),
  }));
  const remaining = form ? remainingMinor(form) : null;

  const errorText = (field: FieldError, message: string) =>
    fieldError === field ? <Text className="text-xs text-red-600">{message}</Text> : null;

  return (
    <FormScreen
      title={expenseId ? t.editExpense : t.addExpense}
      submitLabel={busy ? t.saving : t.save}
      cancelLabel={t.cancel}
      onSubmit={submit}
      busy={busy}
      loading={loading}
      error={error}>
      {form && event ? (
        <>
          <View className="gap-1">
            <TextField label={t.description} value={form.description} onChangeText={(v) => set("description", v)} />
            {errorText("description", t.fillRequired)}
          </View>

          <View className="gap-1">
            <TextField label={t.amount} value={form.amount} onChangeText={(v) => set("amount", v)} numeric />
            {errorText("amount", t.invalidAmount)}
          </View>

          <SelectField
            label={t.currency}
            value={form.currency}
            options={currencyOptions}
            onChange={(v) => set("currency", v)}
          />

          <SelectField
            label={t.paidBy}
            value={form.paidBy}
            options={participantOptions}
            onChange={(v) => set("paidBy", v)}
          />

          <DateField label={t.eventDate} value={form.spentOn} onChange={(v) => set("spentOn", v)} />

          <SegmentedToggle
            label={t.splitBetween}
            value={form.mode}
            options={[
              { value: "equal", label: t.splitEqual },
              { value: "exact", label: t.splitExact },
            ]}
            onChange={(v) => set("mode", v === "exact" ? "exact" : "equal")}
          />

          {form.mode === "equal" ? (
            <View className="gap-1">
              {event.participants.map((p) => {
                const checked = form.selected.includes(p.id);
                return (
                  <Pressable key={p.id} className="flex-row items-center gap-2 py-1.5" onPress={() => toggle(p.id)}>
                    <Text className={checked ? "text-brand" : "text-gray-300"}>{checked ? "☑" : "☐"}</Text>
                    <Text className="flex-1 text-sm text-gray-900">{participantLabel(p)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Field label={t.splitExact}>
              <View className="gap-2">
                {event.participants.map((p) => (
                  <View key={p.id} className="flex-row items-center gap-2">
                    <Text className="flex-1 text-sm text-gray-900">{participantLabel(p)}</Text>
                    <TextInput
                      className={`${inputBoxClass} w-32`}
                      value={form.exact[p.id] ?? ""}
                      onChangeText={(v) =>
                        setForm((prev) => (prev ? { ...prev, exact: { ...prev.exact, [p.id]: v } } : prev))
                      }
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                  </View>
                ))}
                <Text className={`text-sm font-medium ${remaining === 0 ? "text-green-600" : "text-red-600"}`}>
                  {t.remaining}: {remaining === null ? "—" : formatMinor(remaining, form.currency, locale)}
                </Text>
              </View>
            </Field>
          )}
          {errorText("split", t.splitInvalid)}
        </>
      ) : null}
    </FormScreen>
  );
}
