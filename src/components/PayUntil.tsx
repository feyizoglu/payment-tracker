"use client";

import { useMemo, useState } from "react";
import { Payment } from "@/types";
import { getInstallments, getCurrencySymbol } from "@/lib/payments";
import { useLang } from "@/lib/i18n";
import { TrendingUp } from "lucide-react";

interface Props {
  payments: Payment[];
}

function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PayUntil({ payments }: Props) {
  const { t } = useLang();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [endDate, setEndDate] = useState(localDateStr(defaultEnd));

  const results = useMemo(() => {
    if (!endDate) return [];
    const [ey, em, ed] = endDate.split("-").map(Number);
    const end = new Date(ey, em - 1, ed);
    end.setHours(23, 59, 59, 999);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (end < now) return [];

    const entries: { payment: Payment; amount: number; dueDate: Date }[] = [];
    for (const payment of payments) {
      for (const inst of getInstallments(payment)) {
        if (inst.isPaid) continue;
        if (inst.dueDate >= now && inst.dueDate <= end) {
          entries.push({ payment, amount: inst.amount, dueDate: inst.dueDate });
        }
      }
    }
    entries.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    return entries;
  }, [payments, endDate]);

  const byCurrency = results.reduce((acc, { payment, amount }) => {
    const cur = payment.currency ?? "TRY";
    acc[cur] = (acc[cur] ?? 0) + amount;
    return acc;
  }, {} as Record<string, number>);

  const hasTotals = Object.keys(byCurrency).length > 0;

  return (
    <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-gray-700">{t.payUntilTitle}</span>
        </div>
        <input
          type="date"
          value={endDate}
          min={localDateStr(today)}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>

      {hasTotals ? (
        <div className="mt-4">
          {/* Totals per currency */}
          <div className="flex flex-wrap gap-3 mb-4">
            {Object.entries(byCurrency).map(([cur, amt]) => (
              <div key={cur} className="bg-purple-50 rounded-xl px-4 py-2.5 flex-1 min-w-[110px]">
                <p className="text-xs text-purple-500 font-medium mb-0.5">{cur}</p>
                <p className="text-xl font-bold text-purple-700">
                  {getCurrencySymbol(cur)}{fmt(amt)}
                </p>
              </div>
            ))}
          </div>

          {/* Payment breakdown */}
          <div className="divide-y divide-gray-50">
            {results.map(({ payment, amount, dueDate }, i) => (
              <div
                key={`${payment.id}-${i}`}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-gray-800 font-medium truncate">{payment.name}</span>
                  <span className="text-gray-400 text-xs shrink-0">
                    {dueDate.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <span className="font-semibold text-gray-700 shrink-0 ml-3">
                  {getCurrencySymbol(payment.currency)}{fmt(amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mt-3">{t.payUntilEmpty}</p>
      )}
    </div>
  );
}
