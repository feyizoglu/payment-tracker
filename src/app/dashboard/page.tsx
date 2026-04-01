"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Payment, Team } from "@/types";
import PaymentForm from "@/components/PaymentForm";
import PaymentCard from "@/components/PaymentCard";
import MonthlyView from "@/components/MonthlyView";
import TeamPanel from "@/components/TeamPanel";
import {
  CreditCard,
  Plus,
  LogOut,
  LayoutGrid,
  Calendar,
  Users,
  ChevronDown,
} from "lucide-react";

type Tab = "monthly" | "all" | "teams";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("monthly");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const fetchPayments = useCallback(async () => {
    const url = selectedTeamId
      ? `/api/payments?team_id=${selectedTeamId}`
      : "/api/payments";
    const res = await fetch(url);
    if (res.ok) setPayments(await res.json());
  }, [selectedTeamId]);

  const fetchTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (res.ok) setTeams(await res.json());
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchPayments();
      fetchTeams();
    }
  }, [status, fetchPayments, fetchTeams]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalMonthly = payments.reduce(
    (s, p) => s + p.amount / p.total_installments,
    0
  );
  const totalRemaining = payments.reduce((s, p) => {
    const rem = p.total_installments - p.paid_installments;
    return s + (p.amount / p.total_installments) * rem;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" />
            <span className="font-bold text-gray-900">PayTrack</span>
          </div>

          {/* Team selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedTeamId ?? ""}
              onChange={(e) => setSelectedTeamId(e.target.value || null)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Personal</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
            >
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-7 h-7 rounded-full"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                  {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
                </div>
              )}
              <span className="hidden sm:block truncate max-w-[120px]">
                {session?.user?.name ?? session?.user?.email}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-900 truncate">
                    {session?.user?.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Active Payments"
            value={payments.filter((p) => p.paid_installments < p.total_installments).length.toString()}
            color="blue"
          />
          <StatCard
            label="Monthly Total"
            value={`₺${totalMonthly.toFixed(0)}`}
            color="purple"
          />
          <StatCard
            label="Total Remaining"
            value={`₺${totalRemaining.toFixed(0)}`}
            color="orange"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Tabs + Add button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(
              [
                { id: "monthly", label: "Monthly", icon: <Calendar className="w-4 h-4" /> },
                { id: "all", label: "All", icon: <LayoutGrid className="w-4 h-4" /> },
                { id: "teams", label: "Teams", icon: <Users className="w-4 h-4" /> },
              ] as { id: Tab; label: string; icon: React.ReactNode }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id
                    ? "bg-white shadow-sm text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowPaymentForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Payment
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "monthly" && (
          <MonthlyView payments={payments} onUpdated={fetchPayments} />
        )}

        {activeTab === "all" && (
          <div>
            {payments.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No payments yet</p>
                <p className="text-sm mt-1">Click "Add Payment" to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((p) => (
                  <PaymentCard
                    key={p.id}
                    payment={p}
                    onUpdated={fetchPayments}
                    onDeleted={fetchPayments}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "teams" && (
          <TeamPanel
            teams={teams}
            onCreated={fetchTeams}
          />
        )}
      </main>

      {/* Payment form modal */}
      {showPaymentForm && (
        <PaymentForm
          teams={teams}
          defaultTeamId={selectedTeamId}
          onClose={() => setShowPaymentForm(false)}
          onCreated={fetchPayments}
        />
      )}

      {/* Backdrop for user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  className = "",
}: {
  label: string;
  value: string;
  color: "blue" | "purple" | "orange";
  className?: string;
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    orange: "bg-orange-50 text-orange-700",
  };
  return (
    <div className={`rounded-xl p-4 ${colors[color]} ${className}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
