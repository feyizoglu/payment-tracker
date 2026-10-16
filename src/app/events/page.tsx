"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { parseISO } from "date-fns";
import { Plus } from "lucide-react";
import type { EventSummary } from "@/types";
import { useLang } from "@/lib/i18n";
import { formatMinor } from "@/lib/split";
import EventsHeader from "@/components/events/EventsHeader";

async function fetchEvents(): Promise<EventSummary[] | null> {
  const res = await fetch("/api/events");
  return res.ok ? res.json() : null;
}

export default function Events() {
  const { status } = useSession();
  const { t } = useLang();
  const router = useRouter();

  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchEvents()
      .then((list) => {
        if (list) setEvents(list);
        else setLoadFailed(true);
      })
      .catch(() => setLoadFailed(true));
  }, [status]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), event_date: date || null }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 201 && typeof data?.id === "string") {
        router.push(`/events/${data.id}`);
        return;
      }
      setError(typeof data?.error === "string" ? data.error : t.updateFailed);
    } catch {
      setError(t.updateFailed);
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <EventsHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <form onSubmit={create} className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">{t.newEvent}</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.eventName}
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label={t.eventDate}
              className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {creating ? t.adding : t.create}
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </form>

        <section>
          <h2 className="font-semibold text-gray-900 mb-3">{t.events}</h2>
          {loadFailed ? (
            <p className="text-sm text-red-600">{t.loadFailed}</p>
          ) : events === null ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{t.noEvents}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.id}`}
                  className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-purple-200 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{ev.name}</p>
                      {ev.event_date && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {parseISO(ev.event_date).toLocaleDateString(t.numberLocale)}
                        </p>
                      )}
                    </div>
                    {ev.status === "closed" && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        {t.closed}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 space-y-0.5">
                    {Object.entries(ev.my_balance).map(([currency, v]) => (
                      <p key={currency} className={`text-sm font-medium ${v > 0 ? "text-green-600" : "text-red-600"}`}>
                        {v > 0 ? t.youAreOwed : t.youOwe} {formatMinor(Math.abs(v), currency, t.numberLocale)}
                      </p>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
