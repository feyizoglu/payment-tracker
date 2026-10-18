"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import type { EventDetail, EventExpense, ExpenseInput } from "@/types";
import { formatMinor, parseDecimalToMinor, participantLabel, splitEqually } from "@/lib/split";
import { ALLOWED_CURRENCIES } from "@/lib/payments";
import { useLang } from "@/lib/i18n";

type Mode = "equal" | "exact";

const inputClass =
  "w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

function minorToInput(amountMinor: number): string {
  return (amountMinor / 100).toString();
}

function isEqualSplit(expense: EventExpense, participantOrder: string[]): boolean {
  const stored = new Map(expense.shares.map((s) => [s.participant_id, s.amount_minor]));
  const expected = splitEqually(expense.amount_minor, participantOrder.filter((id) => stored.has(id)));
  return expected.length === stored.size && expected.every((s) => stored.get(s.participant_id) === s.amount_minor);
}

export default function ExpenseForm({
  event,
  expense,
  onDone,
  onCancel,
}: {
  event: EventDetail;
  expense?: EventExpense;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useLang();
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id;
  const participantIds = event.participants.map((p) => p.id);
  const editingEqual = expense ? isEqualSplit(expense, participantIds) : true;

  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense ? minorToInput(expense.amount_minor) : "");
  const [currency, setCurrency] = useState(expense?.currency ?? ALLOWED_CURRENCIES[0]);
  const [paidBy, setPaidBy] = useState(
    () =>
      expense?.paid_by ??
      event.participants.find((p) => p.user_id === myId)?.id ??
      event.participants[0]?.id ??
      ""
  );
  const [spentOn, setSpentOn] = useState(expense?.spent_on ?? format(new Date(), "yyyy-MM-dd"));
  const [mode, setMode] = useState<Mode>(editingEqual ? "equal" : "exact");
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(expense && editingEqual ? expense.shares.map((s) => s.participant_id) : participantIds)
  );
  const [exact, setExact] = useState<Record<string, string>>(() =>
    expense && !editingEqual
      ? Object.fromEntries(expense.shares.map((s) => [s.participant_id, minorToInput(s.amount_minor)]))
      : {}
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountMinor = parseDecimalToMinor(amount) ?? NaN;
  const amountValid = Number.isFinite(amountMinor) && amountMinor > 0;
  const exactMinor = participantIds.map((id) => (exact[id]?.trim() ? (parseDecimalToMinor(exact[id]) ?? NaN) : 0));
  const exactValid = exactMinor.every((v) => Number.isFinite(v) && v >= 0);
  const exactSum = exactValid ? exactMinor.reduce((sum, v) => sum + v, 0) : NaN;
  const remaining = amountValid && exactValid ? amountMinor - exactSum : NaN;

  const splitValid = mode === "equal" ? checked.size > 0 : remaining === 0 && exactSum > 0;
  const canSubmit = !saving && description.trim() !== "" && amountValid && paidBy !== "" && spentOn !== "" && splitValid;

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const body: ExpenseInput = {
      description: description.trim(),
      amount_minor: amountMinor,
      currency,
      paid_by: paidBy,
      spent_on: spentOn,
      split:
        mode === "equal"
          ? { kind: "equal", participant_ids: participantIds.filter((id) => checked.has(id)) }
          : {
              kind: "exact",
              shares: participantIds
                .map((id, i) => ({ participant_id: id, amount_minor: exactMinor[i] }))
                .filter((s) => s.amount_minor > 0),
            },
    };
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        expense ? `/api/events/${event.id}/expenses/${expense.id}` : `/api/events/${event.id}/expenses`,
        {
          method: expense ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : t.updateFailed);
        return;
      }
      onDone();
    } catch {
      setError(t.updateFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={labelClass}>{t.description}</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t.amount}</label>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>{t.currency}</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {ALLOWED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t.paidBy}</label>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inputClass}>
            {event.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {participantLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t.eventDate}</label>
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={inputClass} required />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{t.splitBetween}</span>
          <div className="flex gap-1">
            {(["equal", "exact"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                  mode === m
                    ? "bg-purple-600 text-white border-purple-600"
                    : "bg-surface text-gray-600 border-gray-200 hover:border-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                }`}
              >
                {m === "equal" ? t.splitEqual : t.splitExact}
              </button>
            ))}
          </div>
        </div>

        {mode === "equal" ? (
          <div className="space-y-1">
            {event.participants.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} />
                {participantLabel(p)}
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {event.participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-gray-700">{participantLabel(p)}</span>
                <input
                  inputMode="decimal"
                  value={exact[p.id] ?? ""}
                  onChange={(e) => setExact({ ...exact, [p.id]: e.target.value })}
                  placeholder="0"
                  className="w-28 rounded-lg border border-gray-200 px-2 py-1"
                />
              </div>
            ))}
            <p className={`text-sm font-medium ${remaining === 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {t.remaining}: {Number.isFinite(remaining) ? formatMinor(remaining, currency, t.numberLocale) : "—"}
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}
