"use client";

import { useState, useMemo } from "react";
import { X, CalendarRange, TrendingUp } from "lucide-react";
import { Payment } from "@/types";
import { getInstallments } from "@/lib/payments";
import { UserMap } from "@/components/CalendarView";
import { useLang } from "@/lib/i18n";

interface Props {
  payments: Payment[];
  userMap?: UserMap;
  onClose: () => void;
}

function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const PALETTE = [
  "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444",
  "#10B981", "#EC4899", "#F97316", "#14B8A6",
];
function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function userColor(userId: string, userMap?: UserMap): string {
  return userMap?.[userId]?.color ?? hashColor(userId);
}

export default function DateRangeReport({ payments, userMap = {}, onClose }: Props) {
  const { t } = useLang();

  const today = new Date();
  const [startDate, setStartDate] = useState(localDateStr(today));
  const endDefault = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const [endDate, setEndDate] = useState(localDateStr(endDefault));

  const results = useMemo(() => {
    if (!startDate || !endDate) return [];
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    if (start > end) return [];

    const entries: {
      payment: Payment;
      instIndex: number;
      dueDate: Date;
      amount: number;
      isPaid: boolean;
    }[] = [];

    for (const payment of payments) {
      const installments = getInstallments(payment);
      for (const inst of installments) {
        if (inst.dueDate >= start && inst.dueDate <= end) {
          entries.push({
            payment,
            instIndex: inst.index,
            dueDate: inst.dueDate,
            amount: inst.amount,
            isPaid: inst.isPaid,
          });
        }
      }
    }

    entries.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return entries;
  }, [payments, startDate, endDate]);

  const totalDue = results.reduce((s, e) => s + e.amount, 0);
  const totalPaid = results.filter(e => e.isPaid).reduce((s, e) => s + e.amount, 0);
  const totalUnpaid = totalDue - totalPaid;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-blue-500" />
            {t.dateRangeReport}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date pickers */}
        <div className="p-5 border-b border-gray-100 shrink-0">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t.startDate}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t.endDate}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        {results.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100 shrink-0 grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-500 font-medium mb-1">{t.totalDue}</p>
              <p className="text-lg font-bold text-blue-700">₺{fmt(totalDue)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xs text-green-500 font-medium mb-1">{t.paid}</p>
              <p className="text-lg font-bold text-green-700">₺{fmt(totalPaid)}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <p className="text-xs text-orange-500 font-medium mb-1">{t.remaining}</p>
              <p className="text-lg font-bold text-orange-700">₺{fmt(totalUnpaid)}</p>
            </div>
          </div>
        )}

        {/* List */}
        <div className="overflow-y-auto flex-1 p-5">
          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">{t.noPaymentsRange}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((entry, i) => {
                const color = userColor(entry.payment.user_id, userMap);
                const addedBy = userMap[entry.payment.user_id];
                return (
                  <div
                    key={`${entry.payment.id}-${entry.instIndex}-${i}`}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      entry.isPaid ? "bg-green-50 border-green-100 opacity-60" : "bg-white border-gray-100"
                    }`}
                    style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${entry.isPaid ? "line-through text-gray-400" : "text-gray-800"}`}>
                          {entry.payment.name}
                        </span>
                        {entry.isPaid && (
                          <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-medium">
                            {t.paid}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">
                          {entry.dueDate.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                          {" · "}{t.installmentOf} {entry.instIndex + 1}/{entry.payment.total_installments}
                        </p>
                        {addedBy && (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${entry.isPaid ? "text-gray-400" : "text-gray-900"}`}>
                      ₺{fmt(entry.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
