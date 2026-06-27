"use client";

import { useState } from "react";
import { Payment, RecurringPayment, Occurrence, CurrencyAmount } from "@/types";
import { getOccurrencesForMonth, getCurrencySymbol } from "@/lib/payments";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { tr as dateFnsTr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Trash2, Pencil } from "lucide-react";
import { useLang } from "@/lib/i18n";

export type UserMap = Record<string, { name: string | null; email: string; avatar_url: string | null; color?: string | null }>;

interface Props {
  payments: Payment[];
  recurrings?: RecurringPayment[];
  userMap?: UserMap;
  onUpdated: () => void;
  onDaySelected?: (date: Date | null) => void;
  onMonthChange?: (date: Date) => void;
}

const PALETTE = [
  "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444",
  "#10B981", "#EC4899", "#F97316", "#14B8A6",
];

function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function userColor(userId: string, userMap?: UserMap): string {
  return userMap?.[userId]?.color ?? hashColor(userId);
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function CalendarView({ payments, recurrings = [], userMap = {}, onUpdated, onDaySelected, onMonthChange }: Props) {
  const { lang, t } = useLang();
  const locale = lang === "tr" ? dateFnsTr : undefined;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState<string | null>(null);
  const [editing, setEditing] = useState<Occurrence | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const occurrences = getOccurrencesForMonth(payments, recurrings, year, month);

  const totalDue = occurrences.reduce((s, o) => s + (o.amount ?? 0), 0);
  const totalPaid = occurrences
    .filter((o) => o.isPaid)
    .reduce((s, o) => s + (o.amount ?? 0), 0);

  // Per-currency totals for the header summary
  const headerSummary = (() => {
    const paid: Record<string, number> = {};
    const due: Record<string, number> = {};
    for (const o of occurrences) {
      if (o.amount == null) continue;
      const cur = o.currency ?? "TRY";
      due[cur] = (due[cur] ?? 0) + o.amount;
      if (o.isPaid) paid[cur] = (paid[cur] ?? 0) + o.amount;
    }
    return Object.keys(due)
      .map((cur) => {
        const sym = getCurrencySymbol(cur);
        return `${sym}${fmt(paid[cur] ?? 0)} ${t.paid} / ${sym}${fmt(due[cur])} ${t.total}`;
      })
      .join(" · ");
  })();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = format(o.dueDate, "yyyy-MM-dd");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(o);
  }

  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedOccurrences = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  function navigate(dir: 1 | -1) {
    const next = dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
    setCurrentDate(next);
    onMonthChange?.(next);
  }

  function handleDayClick(day: Date) {
    const isSame = selectedDay ? isSameDay(day, selectedDay) : false;
    const next = isSame ? null : day;
    setSelectedDay(next);
    onDaySelected?.(next);
  }

  async function togglePaid(o: Occurrence) {
    const key = `${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}`;
    setLoading(key);
    if (o.kind === "installment") {
      const newPaid = o.isPaid ? o.installmentIndex! : o.installmentIndex! + 1;
      await fetch(`/api/payments/${o.sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid_installments: newPaid }),
      });
    } else {
      await fetch(`/api/recurring/${o.sourceId}/entry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: o.period, is_paid: !o.isPaid }),
      });
    }
    onUpdated();
    setLoading(null);
  }

  async function deleteOccurrence(o: Occurrence) {
    if (o.kind === "installment") {
      if (!confirm(`"${o.name}" silinsin mi?`)) return;
      setLoading(`delete-${o.sourceId}`);
      await fetch(`/api/payments/${o.sourceId}`, { method: "DELETE" });
    } else {
      if (!confirm(t.recurringDeleteConfirm)) return;
      setLoading(`delete-${o.sourceId}`);
      await fetch(`/api/recurring/${o.sourceId}`, { method: "DELETE" });
    }
    onUpdated();
    setLoading(null);
  }

  // Resolve the current per-currency amount lines for an installment occurrence,
  // so the edit modal can show/edit every line regardless of which one was clicked.
  function installmentInitialAmounts(o: Occurrence): CurrencyAmount[] {
    const p = payments.find((pp) => pp.id === o.sourceId);
    if (!p) return [{ currency: o.currency ?? "TRY", amount: o.amount ?? 0 }];
    const override = p.overrides?.find((ov) => ov.installment_index === o.installmentIndex);
    if (override?.amounts && override.amounts.length > 0) return override.amounts;
    if (override?.amount != null) return [{ currency: p.currency ?? "TRY", amount: override.amount }];
    const def = p.amount / p.total_installments;
    return [{ currency: p.currency ?? "TRY", amount: Number(def.toFixed(2)) }];
  }

  // Resolve the current per-currency amount lines for a recurring occurrence's month.
  function recurringInitialAmounts(o: Occurrence): CurrencyAmount[] {
    const r = recurrings.find((rr) => rr.id === o.sourceId);
    const entry = r?.entries?.find((e) => e.period === o.period);
    if (entry?.amounts && entry.amounts.length > 0) return entry.amounts;
    if (entry?.amount != null) return [{ currency: r?.currency ?? o.currency ?? "TRY", amount: entry.amount }];
    return [{ currency: r?.currency ?? o.currency ?? "TRY", amount: 0 }]; // blank line for amount-less reminders
  }

  const weekDays = lang === "tr"
    ? ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {format(currentDate, "MMMM yyyy", { locale })}
          </h2>
          <p className="text-sm text-gray-400">{headerSummary}</p>
        </div>
        <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100 transition">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Progress bar */}
      {totalDue > 0 && (
        <div className="mb-4">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${(totalPaid / totalDue) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekDays.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const key = format(day, "yyyy-MM-dd");
            const dayItems = byDay.get(key) ?? [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const hasItems = dayItems.length > 0;
            const allPaid = hasItems && dayItems.every((o) => o.isPaid);
            const hasBorder = i % 7 !== 6;

            return (
              <button
                key={key}
                onClick={() => handleDayClick(day)}
                className={`relative min-h-[56px] p-1.5 flex flex-col items-center gap-1 border-b border-r border-gray-50 transition
                  ${!isCurrentMonth ? "opacity-30" : ""}
                  ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}
                  ${!hasBorder ? "border-r-0" : ""}
                `}
              >
                <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                  ${isToday(day) ? "bg-blue-600 text-white" : isSelected ? "text-blue-600" : "text-gray-700"}
                `}>
                  {format(day, "d")}
                </span>

                {hasItems && (
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayItems.slice(0, 4).map((o, di) => (
                      <span
                        key={`${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}-${o.currency}-${di}`}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: o.isPaid ? "#86EFAC" : userColor(o.user_id, userMap),
                        }}
                      />
                    ))}
                    {dayItems.length > 4 && (
                      <span className="text-[10px] text-gray-400">+{dayItems.length - 4}</span>
                    )}
                  </div>
                )}

                {hasItems && (() => {
                  const by: Record<string, number> = {};
                  for (const o of dayItems) {
                    if (o.amount == null) continue;
                    const cur = o.currency ?? "TRY";
                    by[cur] = (by[cur] ?? 0) + o.amount;
                  }
                  return Object.entries(by).map(([cur, amt]) => (
                    <span key={cur} className={`text-[10px] font-medium leading-none ${allPaid ? "text-green-500" : "text-blue-500"}`}>
                      {getCurrencySymbol(cur)}{fmt(amt)}
                    </span>
                  ));
                })()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            {format(selectedDay, "d MMMM yyyy", { locale })}
            {selectedOccurrences.length === 0 && (
              <span className="font-normal text-gray-400 ml-2">{t.noPaymentsDay}</span>
            )}
          </h3>

          {selectedOccurrences.length > 0 && (
            <div className="space-y-2">
              {selectedOccurrences.map((o, oi) => {
                const key = `${o.kind}-${o.sourceId}-${o.installmentIndex ?? o.period}`;
                const rowKey = `${key}-${o.currency}-${oi}`;
                const isLoadingItem = loading === key || loading === `delete-${o.sourceId}`;
                const color = userColor(o.user_id, userMap);
                const addedBy = userMap[o.user_id];
                return (
                  <div
                    key={rowKey}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      o.isPaid ? "bg-green-50 border-green-100" : "bg-white border-gray-100"
                    }`}
                    style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  >
                    <button
                      disabled={isLoadingItem}
                      onClick={() => togglePaid(o)}
                      className="shrink-0 transition hover:scale-110 disabled:opacity-50"
                    >
                      {o.isPaid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <span className={`font-medium text-sm ${o.isPaid ? "line-through text-gray-400" : "text-gray-800"}`}>
                        {o.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">
                          {o.kind === "installment"
                            ? `${t.installmentOf} ${o.installmentIndex! + 1} ${t.of} ${o.totalInstallments}`
                            : t.recurringBadge}
                        </p>
                        {o.overridden && (
                          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                            {t.editedBadge}
                          </span>
                        )}
                        {addedBy && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-200">·</span>
                            {addedBy.avatar_url ? (
                              <img src={addedBy.avatar_url} alt="" className="w-3.5 h-3.5 rounded-full" />
                            ) : (
                              <span
                                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                                style={{ backgroundColor: color }}
                              >
                                {(addedBy.name ?? addedBy.email)[0].toUpperCase()}
                              </span>
                            )}
                            <span className="text-xs text-gray-400 truncate max-w-[80px]">
                              {addedBy.name ?? addedBy.email}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {o.amount == null ? (
                      <span className="text-sm font-semibold shrink-0 text-gray-300">—</span>
                    ) : (
                      <span className={`text-sm font-semibold shrink-0 ${o.isPaid ? "text-gray-400" : "text-gray-900"}`}>
                        {getCurrencySymbol(o.currency)}{fmt(o.amount, 2)}
                      </span>
                    )}

                    <button
                      disabled={isLoadingItem}
                      onClick={() => setEditing(o)}
                      className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition disabled:opacity-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      disabled={isLoadingItem}
                      onClick={() => deleteOccurrence(o)}
                      className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {editing && (
        <EditOccurrenceModal
          occurrence={editing}
          initialAmounts={editing.kind === "installment" ? installmentInitialAmounts(editing) : recurringInitialAmounts(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onUpdated(); }}
          t={t}
        />
      )}
    </div>
  );
}

const CURRENCY_OPTIONS = ["TRY", "USD", "EUR", "GBP"];

type AmountLine = { currency: string; amount: string };

function EditOccurrenceModal({
  occurrence,
  initialAmounts,
  onClose,
  onSaved,
  t,
}: {
  occurrence: Occurrence;
  initialAmounts?: CurrencyAmount[];
  onClose: () => void;
  onSaved: () => void;
  t: any;
}) {
  const isRecurring = occurrence.kind === "recurring";
  const [date, setDate] = useState(format(occurrence.dueDate, "yyyy-MM-dd"));
  // Both recurring reminders and installments support multiple currency lines.
  const [lines, setLines] = useState<AmountLine[]>(
    (initialAmounts && initialAmounts.length > 0
      ? initialAmounts
      : [{ currency: occurrence.currency ?? "TRY", amount: occurrence.amount ?? 0 }]
    ).map((l) => ({ currency: l.currency, amount: l.amount ? String(l.amount) : "" }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<AmountLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { currency: "TRY", amount: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(reset: boolean) {
    setError(null);

    let body: Record<string, unknown>;
    if (reset) {
      // Recurring "Reset day" only clears the date override; installment reset removes the whole override.
      body = isRecurring
        ? { period: occurrence.period, due_date: null }
        : { installment_index: occurrence.installmentIndex, due_date: null, amount: null };
    } else {
      const amounts: CurrencyAmount[] = [];
      for (const l of lines) {
        if (l.amount.trim() === "") continue; // skip blank rows
        const n = Number(l.amount);
        if (!Number.isFinite(n) || n <= 0) {
          setError(t.amounts + " > 0");
          return;
        }
        amounts.push({ currency: l.currency, amount: n });
      }
      body = isRecurring
        ? { period: occurrence.period, due_date: date || null, amounts }
        : { installment_index: occurrence.installmentIndex, due_date: date || null, amounts };
    }

    const url = isRecurring
      ? `/api/recurring/${occurrence.sourceId}/entry`
      : `/api/payments/${occurrence.sourceId}/override`;

    setSaving(true);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Error");
      setSaving(false);
      return;
    }
    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{isRecurring ? t.editReminder : t.editInstallment}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-xl leading-none">×</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(false); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.installmentDate}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.amounts}</label>
            <div className="space-y-2">
              {lines.map((line, i) => (
                  <div key={i} className="flex rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                    <select
                      value={line.currency}
                      onChange={(e) => updateLine(i, { currency: e.target.value })}
                      className="bg-gray-50 border-r border-gray-200 px-2 text-sm text-gray-700 focus:outline-none"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.amount}
                      onChange={(e) => updateLine(i, { amount: e.target.value })}
                      className="flex-1 min-w-0 px-3 py-2.5 text-sm text-black focus:outline-none"
                    />
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="px-3 text-gray-400 hover:text-red-500 transition text-lg leading-none"
                        aria-label="remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLine}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition"
              >
                + {t.addCurrency}
              </button>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(true)}
              className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-60"
            >
              {isRecurring ? t.resetDay : t.resetToDefault}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? "…" : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
