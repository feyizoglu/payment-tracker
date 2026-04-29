"use client";

import { useState } from "react";
import { Payment } from "@/types";
import { getInstallments, getRemainingAmount, getTotalMonthly, getCurrencySymbol } from "@/lib/payments";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Trash2, CheckCircle2, Circle, Pencil, X } from "lucide-react";
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
  canManage?: boolean;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function PaymentCard({ payment, userMap = {}, canManage = false, onUpdated, onDeleted }: Props) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const installments = getInstallments(payment);
  const monthly = getTotalMonthly(payment);
  const remaining = getRemainingAmount(payment);
  const progress = (payment.paid_installments / payment.total_installments) * 100;
  const color = userColor(payment.user_id, userMap);
  const addedBy = userMap[payment.user_id];
  const sym = getCurrencySymbol(payment.currency);

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
    <>
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
                <span>{sym}{fmt(monthly)}{t.perMonth}</span>
                <span>·</span>
                <span>{payment.paid_installments}/{payment.total_installments} {t.paid}</span>
                <span>·</span>
                <span className="text-orange-500 font-medium">{sym}{fmt(remaining)} {t.left}</span>
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
              {canManage && (
                <>
                  <button
                    onClick={() => setShowEdit(true)}
                    disabled={loading}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={loading}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
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
                <span className="font-medium">{sym}{fmt(inst.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && (
        <EditPaymentModal
          payment={payment}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onUpdated(); setShowEdit(false); }}
          t={t}
        />
      )}
    </>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditPaymentModal({
  payment,
  onClose,
  onSaved,
  t,
}: {
  payment: Payment;
  onClose: () => void;
  onSaved: () => void;
  t: any;
}) {
  const [name, setName] = useState(payment.name);
  const [amount, setAmount] = useState(String(payment.amount));
  const [currency, setCurrency] = useState(payment.currency ?? "TRY");
  const [totalInstallments, setTotalInstallments] = useState(String(payment.total_installments));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minInstallments = payment.paid_installments;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const total = Number(totalInstallments);
    if (total < minInstallments) {
      setError(`${t.numberOfInstallments} ≥ ${minInstallments}`);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/payments/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        amount: Number(amount),
        currency,
        total_installments: total,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const d = await res.json();
      setError(d.error ?? "Error");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{t.editPayment}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.paymentName}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.totalAmount}</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="bg-gray-50 border-r border-gray-200 px-2 text-sm text-gray-700 focus:outline-none"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
              </select>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="any"
                required
                className="flex-1 px-3 py-2.5 text-sm text-black focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.numberOfInstallments}</label>
            <input
              type="number"
              value={totalInstallments}
              onChange={(e) => setTotalInstallments(e.target.value)}
              min={minInstallments}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {minInstallments > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {t.paid}: {minInstallments} — {t.numberOfInstallments} ≥ {minInstallments}
              </p>
            )}
          </div>

          {Number(amount) > 0 && Number(totalInstallments) > 0 && (
            <p className="text-sm text-gray-500">
              {t.monthlyPayment}: {getCurrencySymbol(currency)}{(Number(amount) / Number(totalInstallments)).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {t.cancel}
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
