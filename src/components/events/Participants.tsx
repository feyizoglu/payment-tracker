"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { EventDetail, Team } from "@/types";
import { participantLabel } from "@/lib/split";
import { useLang } from "@/lib/i18n";

type AddBody = { user_id: string } | { email: string } | { display_name: string };

async function fetchTeams(): Promise<Team[]> {
  const res = await fetch("/api/teams");
  return res.ok ? res.json() : [];
}

const inputClass =
  "flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent";
const addButtonClass =
  "px-3 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition disabled:opacity-50";

export default function Participants({
  event,
  myId,
  editable,
  onChanged,
}: {
  event: EventDetail;
  myId: string | undefined;
  editable: boolean;
  onChanged: () => void;
}) {
  const { t } = useLang();
  const [teams, setTeams] = useState<Team[]>([]);
  const [mate, setMate] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTeams()
      .then(setTeams)
      .catch(() => setTeams([]));
  }, []);

  const inEvent = new Set(event.participants.map((p) => p.user_id).filter((id): id is string => id !== null));
  const mates = new Map<string, string>();
  for (const team of teams) {
    for (const m of team.members ?? []) {
      if (m.user_id === myId || inEvent.has(m.user_id) || mates.has(m.user_id)) continue;
      mates.set(m.user_id, m.user?.name ?? m.user?.email ?? "?");
    }
  }

  async function add(body: AddBody, reset: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/participants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : t.updateFailed);
        return;
      }
      reset();
      onChanged();
    } catch {
      setError(t.updateFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove(pid: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/participants/${pid}`, { method: "DELETE" });
      if (res.status === 409) {
        setError(t.cannotRemoveParticipant);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === "string" ? data.error : t.updateFailed);
        return;
      }
      onChanged();
    } catch {
      setError(t.updateFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="font-semibold text-gray-900 mb-3">{t.participants}</h2>
      <div className="flex flex-wrap gap-2">
        {event.participants.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-1 pl-3 pr-2 py-1 rounded-full bg-purple-50 text-purple-700 text-sm"
          >
            {participantLabel(p)}
            {editable && p.user_id !== event.created_by && (
              <button
                disabled={busy}
                onClick={() => remove(p.id)}
                aria-label={t.delete}
                className="text-purple-400 hover:text-red-600 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>

      {editable && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">{t.addParticipant}</p>
          {mates.size > 0 && (
            <div className="flex gap-2">
              <select value={mate} onChange={(e) => setMate(e.target.value)} className={inputClass}>
                <option value="">{t.fromTeams}</option>
                {[...mates].map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !mate}
                onClick={() => add({ user_id: mate }, () => setMate(""))}
                aria-label={t.addParticipant}
                className={addButtonClass}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.addByEmail}
              className={inputClass}
            />
            <button
              disabled={busy || !email.trim()}
              onClick={() => add({ email: email.trim() }, () => setEmail(""))}
              aria-label={t.addParticipant}
              className={addButtonClass}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t.addByName}
              className={inputClass}
            />
            <button
              disabled={busy || !displayName.trim()}
              onClick={() => add({ display_name: displayName.trim() }, () => setDisplayName(""))}
              aria-label={t.addParticipant}
              className={addButtonClass}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </section>
  );
}
