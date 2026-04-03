"use client";

import { useState } from "react";
import { Team } from "@/types";
import { Users, Plus, Mail, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface Props {
  teams: Team[];
  onCreated: () => void;
}

export default function TeamPanel({ teams, onCreated }: Props) {
  const { t } = useLang();
  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitingTeamId, setInvitingTeamId] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeamName.trim() }),
    });
    setCreatingTeam(false);
    if (res.ok) {
      setNewTeamName("");
      onCreated();
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!invitingTeamId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setMsg(null);
    const res = await fetch(`/api/teams/${invitingTeamId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const data = await res.json();
    setInviteLoading(false);
    if (res.ok) {
      setMsg({ type: "ok", text: "Member added!" });
      setInviteEmail("");
      onCreated();
    } else {
      setMsg({ type: "err", text: data.error ?? "Failed" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Create team */}
      <form onSubmit={createTeam} className="flex gap-2">
        <input
          type="text"
          placeholder={t.newTeamName}
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={creatingTeam || !newTeamName.trim()}
          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1"
        >
          {creatingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t.create}
        </button>
      </form>

      {/* Team list */}
      {teams.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t.noTeams}
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => (
            <div key={team.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold text-gray-900">{team.name}</h3>
                <span className="text-xs text-gray-400 ml-auto">
                  {team.members?.length ?? 0} {t.member}
                </span>
              </div>

              {/* Members */}
              <div className="space-y-1 mb-3">
                {team.members?.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-2 text-sm text-gray-600">
                    {m.user?.avatar_url ? (
                      <img src={m.user.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                        {(m.user?.name ?? m.user?.email ?? "?")[0].toUpperCase()}
                      </div>
                    )}
                    <span className="truncate">{m.user?.name ?? m.user?.email}</span>
                    {m.role === "owner" && (
                      <span className="text-xs text-blue-500 font-medium">{t.owner}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Invite */}
              {invitingTeamId === team.id ? (
                <form onSubmit={invite} className="flex gap-2">
                  <input
                    type="email"
                    placeholder={t.invitePlaceholder}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {inviteLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : t.invite}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setInvitingTeamId(null); setMsg(null); }}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition"
                  >
                    {t.cancel}
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => { setInvitingTeamId(team.id); setMsg(null); }}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Mail className="w-3 h-3" /> {t.invite}
                </button>
              )}

              {msg && invitingTeamId === team.id && (
                <p className={`text-xs mt-2 ${msg.type === "ok" ? "text-green-600" : "text-red-500"}`}>
                  {msg.text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
