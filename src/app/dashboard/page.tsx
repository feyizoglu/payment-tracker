"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Payment, Team } from "@/types";
import PaymentForm from "@/components/PaymentForm";
import PaymentCard from "@/components/PaymentCard";
import CalendarView, { UserMap } from "@/components/CalendarView";
import TeamPanel from "@/components/TeamPanel";
import DateRangeReport from "@/components/DateRangeReport";
import Link from "next/link";
import {
  CreditCard,
  Plus,
  LogOut,
  LayoutGrid,
  Calendar,
  Users,
  ChevronDown,
  CalendarRange,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { getPaymentsForMonth, getCurrencySymbol } from "@/lib/payments";

type View = "monthly" | "all";

export default function Dashboard() {
  const { data: session, status } = useSession();
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeView, setActiveView] = useState<View>("monthly");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTeamsPanel, setShowTeamsPanel] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showDateRange, setShowDateRange] = useState(false);
  const [myColor, setMyColor] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const fetchPayments = useCallback(async () => {
    let url = "/api/payments?filter=all";
    const res = await fetch(url);
    if (res.ok) setPayments(await res.json());
  }, []);

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

  // Load current user's saved color from teams data
  useEffect(() => {
    if (teams.length > 0 && session?.user) {
      const uid = (session.user as any).id;
      for (const team of teams) {
        const me = team.members?.find((m) => m.user_id === uid);
        if (me?.user && (me.user as any).color) {
          setMyColor((me.user as any).color);
          break;
        }
      }
    }
  }, [teams, session]);

  // Build a map of userId -> user info from session + team members (must be before early return)
  const userMap = useMemo<UserMap>(() => {
    const map: UserMap = {};
    if (session?.user) {
      const uid = (session.user as any).id;
      if (uid) map[uid] = {
        name: session.user.name ?? null,
        email: session.user.email!,
        avatar_url: session.user.image ?? null,
        color: myColor,
      };
    }
    teams.forEach((team) => {
      team.members?.forEach((m) => {
        if (m.user) {
          const isMe = m.user_id === (session?.user as any)?.id;
          map[m.user_id] = {
            name: m.user.name,
            email: m.user.email,
            avatar_url: m.user.avatar_url,
            color: isMe ? myColor : (m.user as any).color ?? null,
          };
        }
      });
    });
    return map;
  }, [session, teams, myColor]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Apply filter locally
  const filteredPayments = payments.filter((p) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "personal") return !p.team_id;
    return p.team_id === activeFilter;
  });

  // Monthly total: only payments due in the currently viewed calendar month
  const calYear = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();
  const currentMonthEntries = getPaymentsForMonth(filteredPayments, calYear, calMonth);
  // Weekly total: payments due in the current real week (Mon–Sun)
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const weekEntries = currentMonthEntries.filter(({ installment }) => {
    const d = installment.dueDate;
    return d >= weekStart && d <= weekEnd && !installment.isPaid;
  });

  function fmtStat(n: number) {
    return n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function toCurrencyLines(
    entries: { payment: Payment; installment: { amount: number; isPaid: boolean } }[]
  ): string[] {
    const by: Record<string, number> = {};
    for (const { payment, installment } of entries) {
      if (installment.isPaid) continue;
      const cur = payment.currency ?? "TRY";
      by[cur] = (by[cur] ?? 0) + installment.amount;
    }
    const items = Object.entries(by);
    if (items.length === 0) return [`${getCurrencySymbol("TRY")}0`];
    return items.map(([cur, amt]) => `${getCurrencySymbol(cur)}${fmtStat(amt)}`);
  }

  const monthlyLines = toCurrencyLines(currentMonthEntries);
  const weeklyLines = toCurrencyLines(weekEntries);

  const filters = [
    { id: "all", label: t.all },
    { id: "personal", label: t.personal },
    ...teams.map((team) => ({ id: team.id, label: team.name })),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-gray-900">PayTrack</span>
            </div>
            <nav className="flex items-center gap-1">
              <span className="px-3 py-1.5 rounded-lg text-sm text-blue-700 bg-blue-50 font-semibold">
                {t.dashboard}
              </span>
              <Link
                href="/economy"
                className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition font-medium"
              >
                {t.economy}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "tr" : "en")}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {lang === "en" ? "🇹🇷 TR" : "🇬🇧 EN"}
            </button>

            {/* Teams button */}
            <button
              onClick={() => setShowTeamsPanel(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:block">{t.teams}</span>
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
              >
                {session?.user?.image ? (
                  <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
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
                    <p className="text-xs font-medium text-gray-900 truncate">{session?.user?.name}</p>
                    <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    {t.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label={t.activePayments}
            lines={[filteredPayments.filter((p) => p.paid_installments < p.total_installments).length.toString()]}
            color="blue"
          />
          <StatCard
            label={t.monthlyTotal}
            lines={monthlyLines}
            color="purple"
          />
          <StatCard
            label={t.weeklyTotal}
            lines={weeklyLines}
            color="orange"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                activeFilter === f.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* View toggle + Add button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(
              [
                { id: "monthly", label: t.monthly, icon: <Calendar className="w-4 h-4" /> },
                { id: "all", label: t.all, icon: <LayoutGrid className="w-4 h-4" /> },
              ] as { id: View; label: string; icon: React.ReactNode }[]
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveView(v.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  activeView === v.id
                    ? "bg-white shadow-sm text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowDateRange(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            <CalendarRange className="w-4 h-4" />
            <span className="hidden sm:block">{t.dateRangeReport}</span>
          </button>
          <button
            onClick={() => setShowPaymentForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t.addPayment}
          </button>
        </div>

        {/* Content */}
        {activeView === "monthly" && (
          <CalendarView
            payments={filteredPayments}
            userMap={userMap}
            onUpdated={fetchPayments}
            onDaySelected={setSelectedCalendarDay}
            onMonthChange={setCalendarDate}
          />
        )}

        {activeView === "all" && (
          <div>
            {filteredPayments.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">{t.noPayments}</p>
                <p className="text-sm mt-1">{t.noPaymentsHint}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPayments.map((p) => {
                  const currentUserId = (session?.user as any)?.id;
                  const isOwner = p.user_id === currentUserId;
                  const isTeamAdmin = p.team_id
                    ? teams.find((t) => t.id === p.team_id)?.members?.find(
                        (m) => m.user_id === currentUserId
                      )?.role === "owner"
                    : false;
                  return (
                    <PaymentCard
                      key={p.id}
                      payment={p}
                      userMap={userMap}
                      canManage={isOwner || isTeamAdmin}
                      onUpdated={fetchPayments}
                      onDeleted={fetchPayments}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Payment form modal */}
      {showPaymentForm && (
        <PaymentForm
          teams={teams}
          currentUserId={(session?.user as any)?.id}
          defaultTeamId={activeFilter !== "all" && activeFilter !== "personal" ? activeFilter : null}
          defaultDate={selectedCalendarDay ? (() => {
            const d = selectedCalendarDay;
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          })() : null}
          onClose={() => setShowPaymentForm(false)}
          onCreated={fetchPayments}
        />
      )}

      {/* Teams panel modal */}
      {showTeamsPanel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                {t.manageTeams}
              </h2>
              <button
                onClick={() => setShowTeamsPanel(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-5">
              <TeamPanel
                teams={teams}
                currentUserId={(session?.user as any)?.id}
                currentUserColor={myColor}
                onCreated={() => { fetchTeams(); }}
                onColorChanged={(color) => setMyColor(color)}
              />
            </div>
          </div>
          <div className="fixed inset-0 bg-black/30 -z-10" onClick={() => setShowTeamsPanel(false)} />
        </div>
      )}

      {/* Date range report modal */}
      {showDateRange && (
        <DateRangeReport
          payments={filteredPayments}
          userMap={userMap}
          onClose={() => setShowDateRange(false)}
        />
      )}

      {/* Backdrop for user menu */}
      {showUserMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
      )}
    </div>
  );
}

function StatCard({
  label,
  lines,
  color,
  className = "",
}: {
  label: string;
  lines: string[];
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
      <div className={lines.length === 1 ? "text-2xl font-bold" : "font-bold space-y-0.5"}>
        {lines.map((line, i) => (
          <p key={i} className={lines.length === 1 ? "" : "text-xl"}>{line}</p>
        ))}
      </div>
    </div>
  );
}
