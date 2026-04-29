"use client";

import { useState } from "react";
import { Payment } from "@/types";
import { getPaymentsForMonth, getCurrencySymbol } from "@/lib/payments";
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
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { useLang } from "@/lib/i18n";

export type UserMap = Record<string, { name: string | null; email: string; avatar_url: string | null; color?: string | null }>;

interface Props {
  payments: Payment[];
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

export default function CalendarView({ payments, userMap = {}, onUpdated, onDaySelected, onMonthChange }: Props) {
  const { lang, t } = useLang();
  const locale = lang === "tr" ? dateFnsTr : undefined;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthPayments = getPaymentsForMonth(payments, year, month);

  const totalDue = monthPayments.reduce((s, { installment }) => s + installment.amount, 0);
  const totalPaid = monthPayments
    .filter(({ installment }) => installment.isPaid)
    .reduce((s, { installment }) => s + installment.amount, 0);

  // Per-currency totals for the header summary
  const headerSummary = (() => {
    const paid: Record<string, number> = {};
    const due: Record<string, number> = {};
    for (const { payment, installment } of monthPayments) {
      const cur = payment.currency ?? "TRY";
      due[cur] = (due[cur] ?? 0) + installment.amount;
      if (installment.isPaid) paid[cur] = (paid[cur] ?? 0) + installment.amount;
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

  const byDay = new Map<string, typeof monthPayments>();
  for (const entry of monthPayments) {
    const key = format(entry.installment.dueDate, "yyyy-MM-dd");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(entry);
  }

  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedPayments = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

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

  async function togglePaid(paymentId: string, instIndex: number, isPaid: boolean) {
    setLoading(`${paymentId}-${instIndex}`);
    const newPaid = isPaid ? instIndex : instIndex + 1;
    await fetch(`/api/payments/${paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid_installments: newPaid }),
    });
    onUpdated();
    setLoading(null);
  }

  async function deletePayment(paymentId: string, paymentName: string) {
    if (!confirm(`"${paymentName}" silinsin mi?`)) return;
    setLoading(`delete-${paymentId}`);
    await fetch(`/api/payments/${paymentId}`, { method: "DELETE" });
    onUpdated();
    setLoading(null);
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
            const dayPayments = byDay.get(key) ?? [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const hasPayments = dayPayments.length > 0;
            const allPaid = hasPayments && dayPayments.every(({ installment }) => installment.isPaid);
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

                {hasPayments && (
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayPayments.slice(0, 4).map(({ payment, installment }) => (
                      <span
                        key={`${payment.id}-${installment.index}`}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: installment.isPaid
                            ? "#86EFAC"
                            : userColor(payment.user_id, userMap),
                        }}
                      />
                    ))}
                    {dayPayments.length > 4 && (
                      <span className="text-[10px] text-gray-400">+{dayPayments.length - 4}</span>
                    )}
                  </div>
                )}

                {hasPayments && (() => {
                  const by: Record<string, number> = {};
                  for (const { payment, installment } of dayPayments) {
                    const cur = payment.currency ?? "TRY";
                    by[cur] = (by[cur] ?? 0) + installment.amount;
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
            {selectedPayments.length === 0 && (
              <span className="font-normal text-gray-400 ml-2">{t.noPaymentsDay}</span>
            )}
          </h3>

          {selectedPayments.length > 0 && (
            <div className="space-y-2">
              {selectedPayments.map(({ payment, installment }) => {
                const key = `${payment.id}-${installment.index}`;
                const isLoadingItem = loading === key || loading === `delete-${payment.id}`;
                const color = userColor(payment.user_id, userMap);
                const addedBy = userMap[payment.user_id];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      installment.isPaid ? "bg-green-50 border-green-100" : "bg-white border-gray-100"
                    }`}
                    style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  >
                    <button
                      disabled={isLoadingItem}
                      onClick={() => togglePaid(payment.id, installment.index, installment.isPaid)}
                      className="shrink-0 transition hover:scale-110 disabled:opacity-50"
                    >
                      {installment.isPaid ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-300" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <span className={`font-medium text-sm ${installment.isPaid ? "line-through text-gray-400" : "text-gray-800"}`}>
                        {payment.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">
                          {t.installmentOf} {installment.index + 1} {t.of} {payment.total_installments}
                        </p>
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

                    <span className={`text-sm font-semibold shrink-0 ${installment.isPaid ? "text-gray-400" : "text-gray-900"}`}>
                      {getCurrencySymbol(payment.currency)}{fmt(installment.amount, 2)}
                    </span>

                    <button
                      disabled={isLoadingItem}
                      onClick={() => deletePayment(payment.id, payment.name)}
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
    </div>
  );
}
