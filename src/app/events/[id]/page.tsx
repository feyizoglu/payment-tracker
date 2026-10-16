"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { parseISO } from "date-fns";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import type { EventDetail, EventExpense } from "@/types";
import { useLang } from "@/lib/i18n";
import { formatMinor, participantLabel } from "@/lib/split";
import EventsHeader from "@/components/events/EventsHeader";
import Participants from "@/components/events/Participants";
import ExpenseForm from "@/components/events/ExpenseForm";
import SettleUp from "@/components/events/SettleUp";

type LoadResult = { kind: "ok"; detail: EventDetail } | { kind: "notFound" } | { kind: "error" };

async function fetchEvent(id: string): Promise<LoadResult> {
  try {
    const res = await fetch(`/api/events/${id}`);
    if (res.status === 404) return { kind: "notFound" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", detail: await res.json() };
  } catch {
    return { kind: "error" };
  }
}

async function errorText(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const { t } = useLang();
  const router = useRouter();
  const myId = (session?.user as { id?: string } | undefined)?.id;

  const [loaded, setLoaded] = useState<LoadResult | null>(null);
  const [editing, setEditing] = useState<EventExpense | "new" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchEvent(id).then(setLoaded);
  }, [status, id]);

  const load = useCallback(() => {
    fetchEvent(id).then(setLoaded);
  }, [id]);

  async function setEventStatus(next: "open" | "closed") {
    setActionError(null);
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setActionError(await errorText(res, t.updateFailed));
        return;
      }
      setEditing(null);
      load();
    } catch {
      setActionError(t.updateFailed);
    }
  }

  async function deleteEvent() {
    if (!window.confirm(t.eventDeleteConfirm)) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setActionError(await errorText(res, t.updateFailed));
        return;
      }
      router.push("/events");
    } catch {
      setActionError(t.updateFailed);
    }
  }

  async function deleteExpense(expense: EventExpense) {
    if (!window.confirm(`${t.delete}: ${expense.description}?`)) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/events/${id}/expenses/${expense.id}`, { method: "DELETE" });
      if (!res.ok) {
        setActionError(await errorText(res, t.updateFailed));
        return;
      }
      load();
    } catch {
      setActionError(t.updateFailed);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const detail = loaded?.kind === "ok" ? loaded.detail : null;
  const isOpen = detail?.status === "open";
  const isCreator = detail !== null && detail.created_by === myId;
  const nameOf = (pid: string) => {
    const p = detail?.participants.find((x) => x.id === pid);
    return p ? participantLabel(p) : "?";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <EventsHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" />
          {t.events}
        </Link>

        {loaded === null ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loaded.kind === "notFound" ? (
          <p className="text-sm text-gray-500">{t.eventNotFound}</p>
        ) : loaded.kind === "error" || !detail ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-600">{t.loadFailed}</p>
            <button onClick={load} className="text-sm font-medium text-purple-700 hover:underline">
              {t.tryAgain}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900 truncate">{detail.name}</h1>
                  {!isOpen && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      {t.closed}
                    </span>
                  )}
                </div>
                {detail.event_date && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {parseISO(detail.event_date).toLocaleDateString(t.numberLocale)}
                  </p>
                )}
              </div>
              {isCreator && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEventStatus(isOpen ? "closed" : "open")}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    {isOpen ? t.closeEvent : t.reopenEvent}
                  </button>
                  <button
                    onClick={deleteEvent}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t.deleteEvent}
                  </button>
                </div>
              )}
            </div>

            {actionError && <p className="text-sm text-red-600">{actionError}</p>}

            <Participants event={detail} myId={myId} editable={isOpen} onChanged={load} />

            <section className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900">{t.expenses}</h2>
                {isOpen && editing === null && (
                  <button
                    onClick={() => setEditing("new")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition"
                  >
                    <Plus className="w-4 h-4" />
                    {t.addExpense}
                  </button>
                )}
              </div>

              {isOpen && editing !== null && (
                <div className="mb-4 rounded-xl border border-purple-100 bg-purple-50/40 p-4">
                  <ExpenseForm
                    key={editing === "new" ? "new" : editing.id}
                    event={detail}
                    expense={editing === "new" ? undefined : editing}
                    onDone={() => {
                      setEditing(null);
                      load();
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}

              {detail.expenses.length === 0 ? (
                <p className="text-sm text-gray-400">—</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {detail.expenses.map((expense) => (
                    <li key={expense.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{expense.description}</p>
                        <p className="text-xs text-gray-400">
                          {t.paidBy}: {nameOf(expense.paid_by)} · {parseISO(expense.spent_on).toLocaleDateString(t.numberLocale)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatMinor(expense.amount_minor, expense.currency, t.numberLocale)}
                      </span>
                      {isOpen && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditing(expense)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-purple-700 hover:bg-purple-50 transition"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteExpense(expense)}
                            aria-label={t.delete}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 p-5">
              <SettleUp event={detail} isOpen={isOpen} onChanged={load} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
