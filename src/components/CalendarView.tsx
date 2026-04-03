"use client";

import { useState } from "react";
import { Payment } from "@/types";
import { getPaymentsForMonth } from "@/lib/payments";
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
import { ChevronLeft, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface Props {
  payments: Payment[];
  onUpdated: () => void;
}

export default function CalendarView({ payments, onUpdated }: Props) {
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

  // Build calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Group payments by day
  const byDay = new Map<string, typeof monthPayments>();
  for (const entry of monthPayments) {
    const key = format(entry.installment.dueDate, "yyyy-MM-dd");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(entry);
  }

  // Selected day payments
  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedPayments = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

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

  const weekDays = lang === "tr"
    ? ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentDate((d) => subMonths(d, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {format(currentDate, "MMMM yyyy", { locale })}
          </h2>
          <p className="text-sm text-gray-400">
            ₺{totalPaid.toFixed(0)} {t.paid} / ₺{totalDue.toFixed(0)} {t.total}
          </p>
        </div>
        <button
          onClick={() => setCurrentDate((d) => addMonths(d, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
        >
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
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekDays.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const key = format(day, "yyyy-MM-dd");
            const dayPayments = byDay.get(key) ?? [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const hasPayments = dayPayments.length > 0;
            const allPaid = hasPayments && dayPayments.every(({ installment }) => installment.isPaid);
            const hasBorder = i % 7 !== 6; // no right border on last col

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
                className={`relative min-h-[56px] p-1.5 flex flex-col items-center gap-1 border-b border-r border-gray-50 transition
                  ${!isCurrentMonth ? "opacity-30" : ""}
                  ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}
                  ${!hasBorder ? "border-r-0" : ""}
                `}
              >
                <span
                  className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                    ${isToday(day) ? "bg-blue-600 text-white" : isSelected ? "text-blue-600" : "text-gray-700"}
                  `}
                >
                  {format(day, "d")}
                </span>

                {hasPayments && (
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayPayments.slice(0, 3).map(({ payment, installment }) => (
                      <span
                        key={`${payment.id}-${installment.index}`}
                        className={`w-1.5 h-1.5 rounded-full ${
                          installment.isPaid ? "bg-green-400" : "bg-blue-400"
                        }`}
                      />
                    ))}
                    {dayPayments.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{dayPayments.length - 3}</span>
                    )}
                  </div>
                )}

                {hasPayments && (
                  <span className={`text-[10px] font-medium leading-none ${allPaid ? "text-green-500" : "text-blue-500"}`}>
                    ₺{dayPayments.reduce((s, { installment }) => s + installment.amount, 0).toFixed(0)}
                  </span>
                )}
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
                const isLoadingItem = loading === key;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      installment.isPaid ? "bg-green-50 border-green-100" : "bg-white border-gray-100"
                    }`}
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
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.installmentOf} {installment.index + 1} {t.of} {payment.total_installments}
                      </p>
                    </div>

                    <span className={`text-sm font-semibold shrink-0 ${installment.isPaid ? "text-gray-400" : "text-gray-900"}`}>
                      ₺{installment.amount.toFixed(2)}
                    </span>
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
