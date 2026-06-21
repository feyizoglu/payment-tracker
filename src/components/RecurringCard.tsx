"use client";

import { useState } from "react";
import { RecurringPayment } from "@/types";
import { getCurrencySymbol } from "@/lib/payments";
import { Trash2, Pencil, X, RefreshCw } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { UserMap } from "@/components/CalendarView";

const PALETTE = ["#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#10B981", "#EC4899", "#F97316", "#14B8A6"];
function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (Math.imul(31, h) + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function userColor(userId: string, userMap?: UserMap): string {
  return userMap?.[userId]?.color ?? hashColor(userId);
}

interface Props {
  recurring: RecurringPayment;
  userMap?: UserMap;
  canManage?: boolean;
  onUpdated: () => void;
  onDeleted: () => void;
}

export default function RecurringCard({ recurring, userMap = {}, canManage = false, onUpdated, onDeleted }: Props) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const color = userColor(recurring.user_id, userMap);
  const sym = getCurrencySymbol(recurring.currency);
  const dayLabel = t.everyMonthDay.replace("{day}", String(recurring.day_of_month));
  const endLabel = recurring.end_month
    ? `${t.untilMonth} ${recurring.end_month.slice(0, 7)}`
    : t.noEndDate;

  async function handleDelete() {
    if (!confirm(t.recurringDeleteConfirm)) return;
    setLoading(true);
    await fetch(`/api/recurring/${recurring.id}`, { method: "DELETE" });
    onDeleted();
    setLoading(false);
  }

  return (
    <>
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
        style={{ borderLeftWidth: 3, borderLeftColor: color }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-purple-500 shrink-0" />
              <h3 className="font-semibold text-gray-900 truncate">{recurring.name}</h3>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              <span>{dayLabel}</span>
              <span>·</span>
              <span>{t.recurringBadge}</span>
              <span>·</span>
              <span>{sym} {recurring.currency}</span>
              <span>·</span>
              <span className="text-gray-400">{endLabel}</span>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-1 shrink-0">
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
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <EditRecurringModal
          recurring={recurring}
          onClose={() => setShowEdit(false)}
          onSaved={() => { onUpdated(); setShowEdit(false); }}
          t={t}
        />
      )}
    </>
  );
}

function EditRecurringModal({
  recurring,
  onClose,
  onSaved,
  t,
}: {
  recurring: RecurringPayment;
  onClose: () => void;
  onSaved: () => void;
  t: any;
}) {
  const [name, setName] = useState(recurring.name);
  const [day, setDay] = useState(String(recurring.day_of_month));
  const [currency, setCurrency] = useState(recurring.currency ?? "TRY");
  const [endMonth, setEndMonth] = useState(recurring.end_month ? recurring.end_month.slice(0, 7) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/recurring/${recurring.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        day_of_month: Number(day),
        currency,
        end_month: endMonth || null,
      }),
    });
    if (res.ok) onSaved();
    else { const d = await res.json(); setError(d.error ?? "Error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{t.recurringType}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.paymentName}</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.dayOfMonthLabel}</label>
            <input
              type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.currency}</label>
            <select
              value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TRY">₺ TRY</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
              <option value="GBP">£ GBP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.endMonthOptional}</label>
            <input
              type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">{t.cancel}</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60">{saving ? "…" : t.save}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
