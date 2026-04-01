"use client";

import { useState } from "react";
import { Payment } from "@/types";
import { getPaymentsForMonth } from "@/lib/payments";
import { format, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle } from "lucide-react";

interface Props {
  payments: Payment[];
  onUpdated: () => void;
}

export default function MonthlyView({ payments, onUpdated }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthPayments = getPaymentsForMonth(payments, year, month);

  const totalDue = monthPayments.reduce((s, { installment }) => s + installment.amount, 0);
  const totalPaid = monthPayments
    .filter(({ installment }) => installment.isPaid)
    .reduce((s, { installment }) => s + installment.amount, 0);

  async function togglePaid(paymentId: string, currentPaid: number, instIndex: number, isPaid: boolean) {
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

  return (
    <div>
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentDate((d) => subMonths(d, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <p className="text-sm text-gray-400">
            ₺{totalPaid.toFixed(2)} paid / ₺{totalDue.toFixed(2)} total
          </p>
        </div>
        <button
          onClick={() => setCurrentDate((d) => addMonths(d, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 transition"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Summary bar */}
      {totalDue > 0 && (
        <div className="mb-4">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${(totalPaid / totalDue) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Payments */}
      {monthPayments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No payments due this month</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monthPayments.map(({ payment, installment }) => {
            const key = `${payment.id}-${installment.index}`;
            const isLoading = loading === key;

            return (
              <div
                key={key}
                className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                  installment.isPaid
                    ? "bg-green-50 border-green-100"
                    : "bg-white border-gray-100"
                }`}
              >
                <button
                  disabled={isLoading}
                  onClick={() =>
                    togglePaid(payment.id, payment.paid_installments, installment.index, installment.isPaid)
                  }
                  className="shrink-0 transition hover:scale-110 disabled:opacity-50"
                >
                  {installment.isPaid ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${installment.isPaid ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {payment.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {installment.index + 1}/{payment.total_installments}
                    </span>
                    {payment.user && (
                      <span className="text-xs text-gray-400">· {payment.user.name ?? payment.user.email}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Due {format(installment.dueDate, "d MMMM")}
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
  );
}
