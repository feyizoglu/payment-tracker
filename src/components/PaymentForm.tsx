"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Team } from "@/types";

interface Props {
  teams: Team[];
  defaultTeamId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function PaymentForm({ teams, defaultTeamId, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    start_date: new Date().toISOString().split("T")[0],
    day_of_month: "1",
    total_installments: "1",
    team_id: defaultTeamId ?? "",
  });

  const set = (field: string, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          amount: parseFloat(form.amount),
          start_date: form.start_date,
          day_of_month: parseInt(form.day_of_month),
          total_installments: parseInt(form.total_installments),
          team_id: form.team_id || null,
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

  const monthlyAmount =
    form.amount && form.total_installments
      ? (parseFloat(form.amount) / parseInt(form.total_installments)).toFixed(2)
      : null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Add New Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Car loan, Laptop installment"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                ₺
              </span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Start date + Day of month */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Day / Month
              </label>
              <select
                value={form.day_of_month}
                onChange={(e) => set("day_of_month", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}th
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Installments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Installments
            </label>
            <input
              type="number"
              required
              min="1"
              max="120"
              placeholder="e.g. 12"
              value={form.total_installments}
              onChange={(e) => set("total_installments", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {monthlyAmount && (
              <p className="text-xs text-gray-400 mt-1">
                Monthly payment: <span className="font-medium text-gray-600">₺{monthlyAmount}</span>
              </p>
            )}
          </div>

          {/* Team */}
          {teams.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Add to Team (optional)
              </label>
              <select
                value={form.team_id}
                onChange={(e) => set("team_id", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Personal</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
