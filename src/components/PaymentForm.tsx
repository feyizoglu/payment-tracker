"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Team } from "@/types";
import { useLang } from "@/lib/i18n";
import { getCurrencySymbol } from "@/lib/payments";

interface Props {
  teams: Team[];
  currentUserId?: string;
  defaultTeamId?: string | null;
  defaultDate?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function PaymentForm({ teams, currentUserId, defaultTeamId, defaultDate, onClose, onCreated }: Props) {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"total" | "installment">("total");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    totalAmount: "",
    installmentAmount: "",
    currency: "TRY",
    start_date: defaultDate ?? localDateStr(new Date()),
    total_installments: "1",
    team_id: defaultTeamId ?? "",
  });

  const set = (field: string, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    // Reset target user when team changes
    if (field === "team_id") setTargetUserId("");
  };

  // Determine if current user is owner of the selected team
  const selectedTeam = teams.find((t) => t.id === form.team_id);
  const isOwnerOfSelectedTeam =
    !!selectedTeam &&
    selectedTeam.members?.some(
      (m) => m.user_id === currentUserId && m.role === "owner"
    );
  const otherMembers = selectedTeam?.members?.filter((m) => m.user_id !== currentUserId) ?? [];

  const installmentCount = parseInt(form.total_installments) || 1;

  const computedTotal = inputMode === "installment"
    ? (parseFloat(form.installmentAmount) || 0) * installmentCount
    : parseFloat(form.totalAmount) || 0;

  const computedInstallment = inputMode === "total"
    ? (parseFloat(form.totalAmount) || 0) / installmentCount
    : parseFloat(form.installmentAmount) || 0;

  function fmt(n: number) {
    if (!n || isNaN(n)) return "";
    return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const totalAmt = inputMode === "total"
        ? parseFloat(form.totalAmount)
        : (parseFloat(form.installmentAmount) * installmentCount);

      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          amount: totalAmt,
          currency: form.currency,
          start_date: form.start_date,
          total_installments: installmentCount,
          team_id: form.team_id || null,
          target_user_id: targetUserId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add payment");
      }

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{t.addPaymentTitle}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.paymentName}</label>
            <input
              type="text"
              required
              placeholder={t.paymentNamePlaceholder}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Input mode toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t.amountMode}</label>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(["total", "installment"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setInputMode(mode)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition ${
                    inputMode === mode ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {mode === "total" ? t.totalMode : t.perInstallmentMode}
                </button>
              ))}
            </div>
          </div>

          {/* Amount field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {inputMode === "total" ? t.totalAmount : t.perInstallmentAmount}
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <select
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
                className="bg-gray-50 border-r border-gray-200 px-2 text-sm text-gray-700 focus:outline-none"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
              </select>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={inputMode === "total" ? form.totalAmount : form.installmentAmount}
                onChange={(e) => set(inputMode === "total" ? "totalAmount" : "installmentAmount", e.target.value)}
                className="flex-1 px-3 py-2 text-sm text-black focus:outline-none"
              />
            </div>
          </div>

          {/* Installments count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.numberOfInstallments}</label>
            <input
              type="number"
              required
              min="1"
              max="120"
              placeholder="12"
              value={form.total_installments}
              onChange={(e) => set("total_installments", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {computedTotal > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {inputMode === "total"
                  ? <>{t.monthlyPayment}: <span className="font-medium text-gray-600">{getCurrencySymbol(form.currency)}{fmt(computedInstallment)}</span></>
                  : <>{t.totalAmount}: <span className="font-medium text-gray-600">{getCurrencySymbol(form.currency)}{fmt(computedTotal)}</span></>
                }
              </p>
            )}
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.firstPaymentDate}</label>
            <input
              type="date"
              required
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">{t.firstPaymentDateHint}</p>
          </div>

          {/* Team */}
          {teams.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.addToTeam}</label>
              <select
                value={form.team_id}
                onChange={(e) => set("team_id", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t.personalOption}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Add for (admin only) */}
          {isOwnerOfSelectedTeam && otherMembers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.addFor}</label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t.myself}</option>
                {otherMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user?.name ?? m.user?.email ?? m.user_id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? t.adding : t.addPaymentTitle}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
