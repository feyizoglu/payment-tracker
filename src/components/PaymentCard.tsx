"use client";

import { useState } from "react";
import { Payment } from "@/types";
import { getInstallments, getRemainingAmount, getTotalMonthly } from "@/lib/payments";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Trash2, CheckCircle2, Circle } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { UserMap } from "@/components/CalendarView";

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

function fmt(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  payment: Payment;
  userMap?: UserMap;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function PaymentCard({ payment, userMap = {}, onUpdated, onDeleted }: Props) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const installments = getInstallments(payment);
  const monthly = getTotalMonthly(payment);
  const remaining = getRemainingAmount(payment);
  const progress = (payment.paid_installments / payment.total_installments) * 100;
  const color = userColor(payment.user_id, userMap);
  const addedBy = userMap[payment.user_id];

  async function markPaid(upTo: number) {
    setLoading(true);
    await fetch(`/api/payments/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid_installments: upTo }),
    });
    onUpdated();
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${payment.name}"?`)) return;
    setLoading(true);
    await fetch(`/api/payments/${payment.id}`, { method: "DELETE" });
    onDeleted();
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 truncate">{payment.name}</h3>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              <span>₺{fmt(monthly)}{t.perMonth}</span>
              <span>·</span>
              <span>{payment.paid_installments}/{payment.total_installments} {t.paid}</span>
              <span>·</span>
              <span className="text-orange-500 font-medium">₺{fmt(remaining)} {t.left}</span>
              {addedBy && (
                <>
                  <span>·</span>
                  <div className="flex items-center gap-1">
                    {addedBy.avatar_url ? (
                      <img src={addedBy.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                    ) : (
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {(addedBy.name ?? addedBy.email)[0].toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 truncate max-w-[100px]">
                      {addedBy.name ?? addedBy.email}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Installment list */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {installments.map((inst) => (
            <div
              key={inst.index}
              className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                inst.isPaid ? "text-gray-400" : "text-gray-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <button
                  disabled={loading}
                  onClick={() =>
                    markPaid(inst.isPaid ? inst.index : inst.index + 1)
                  }
                  className="transition hover:scale-110"
                >
                  {inst.isPaid ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300" />
                  )}
                </button>
                <span className={inst.isPaid ? "line-through" : ""}>
                  {inst.index + 1}. {format(inst.dueDate, "dd MMM yyyy")}
                </span>
              </div>
              <span className="font-medium">₺{fmt(inst.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
