import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import type { EventDetail } from "@ptracker/shared/types";
import { localeFor, useLang } from "@ptracker/shared/i18n";
import {
  balances,
  formatMinor,
  parseDecimalToMinor,
  participantLabel,
  suggestTransfers,
  type Transfer,
} from "@ptracker/shared/split";
import { inputBoxClass } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const transferKey = (tr: Transfer) => `${tr.currency}:${tr.from}:${tr.to}`;

export function SettleUp({
  event,
  isOpen,
  onChanged,
}: {
  event: EventDetail;
  isOpen: boolean;
  onChanged: () => void;
}) {
  const { t, lang } = useLang();
  const { api } = useAuth();
  const locale = localeFor(lang);
  const [busy, setBusy] = useState<string | null>(null);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const name = (id: string) => {
    const p = event.participants.find((x) => x.id === id);
    return p ? participantLabel(p) : "?";
  };
  const b = balances(event.expenses, event.settlements);
  const transfers = suggestTransfers(b);

  async function record(tr: Transfer) {
    if (busy) return;
    const k = transferKey(tr);
    const typed = partial[k]?.trim();
    const amount = typed ? parseDecimalToMinor(typed) : tr.amount_minor;
    if (amount === null || amount <= 0 || amount > tr.amount_minor) {
      setError(t.invalidAmount);
      return;
    }
    setBusy(k);
    setError(null);
    try {
      await api.post(`/api/events/${event.id}/settlements`, {
        from_participant: tr.from,
        to_participant: tr.to,
        amount_minor: amount,
        currency: tr.currency,
      });
      setPartial((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
      if (e instanceof ApiError && e.status === 409) onChanged();
    } finally {
      setBusy(null);
    }
  }

  function confirmUndo(id: string) {
    if (busy) return;
    Alert.alert(t.undo, t.undoPaymentConfirm, [
      { text: t.cancel, style: "cancel" },
      { text: t.undo, style: "destructive", onPress: () => undo(id) },
    ]);
  }

  async function undo(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    try {
      await api.del(`/api/events/${event.id}/settlements/${id}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.updateFailed);
      if (e instanceof ApiError && e.status === 409) onChanged();
    } finally {
      setBusy(null);
    }
  }

  const balanceRows = Object.entries(b).flatMap(([currency, row]) =>
    Object.entries(row)
      .filter(([, v]) => v !== 0)
      .map(([pid, v]) => ({ key: `${currency}:${pid}`, pid, v, currency }))
  );

  return (
    <View className="gap-4 rounded-xl border border-gray-100 bg-surface p-3">
      <View className="gap-1">
        <Text className="font-semibold text-gray-900">{t.balancesTitle}</Text>
        {balanceRows.length === 0 ? <Text className="text-sm text-gray-400">—</Text> : null}
        {balanceRows.map((r) => (
          <View key={r.key} className="flex-row justify-between">
            <Text className="text-sm text-gray-700">{name(r.pid)}</Text>
            <Text className={`text-sm ${r.v > 0 ? "text-green-600" : "text-red-600"}`}>
              {formatMinor(r.v, r.currency, locale)}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-2">
        <Text className="font-semibold text-gray-900">{t.settleUp}</Text>
        {transfers.length === 0 ? <Text className="text-sm text-gray-400">{t.allSettled}</Text> : null}
        {transfers.map((tr) => {
          const k = transferKey(tr);
          return (
            <View key={k} className="gap-2">
              <Text className="text-sm text-gray-700">
                {name(tr.from)} → {name(tr.to)}:{" "}
                <Text className="font-semibold">{formatMinor(tr.amount_minor, tr.currency, locale)}</Text>
              </Text>
              {isOpen ? (
                <View className="flex-row items-center gap-2">
                  <TextInput
                    className={`${inputBoxClass} flex-1`}
                    value={partial[k] ?? ""}
                    onChangeText={(text) => setPartial((prev) => ({ ...prev, [k]: text }))}
                    placeholder={(tr.amount_minor / 100).toFixed(2)}
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                  />
                  <Pressable
                    disabled={busy !== null}
                    onPress={() => record(tr)}
                    className={`rounded-lg bg-green-600 px-4 py-3 ${busy !== null ? "opacity-50" : ""}`}>
                    <Text className="font-semibold text-white">{t.markPaid}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {event.settlements.length > 0 ? (
        <View className="gap-1">
          <Text className="font-semibold text-gray-900">{t.payments}</Text>
          {event.settlements.map((s) => (
            <View key={s.id} className="flex-row items-center justify-between gap-2 py-1">
              <Text className="flex-1 text-sm text-gray-700">
                {name(s.from_participant)} → {name(s.to_participant)}:{" "}
                {formatMinor(s.amount_minor, s.currency, locale)}
              </Text>
              {isOpen ? (
                <Pressable disabled={busy !== null} onPress={() => confirmUndo(s.id)}>
                  <Text className={`text-sm text-gray-400 ${busy !== null ? "opacity-50" : ""}`}>{t.undo}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
