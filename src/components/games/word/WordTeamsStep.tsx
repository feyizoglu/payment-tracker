"use client";

import { Shuffle, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME, WORD_MAX_TEAM, shuffleTeams, teamColor, type WordSetup, type WordTeam } from "@/lib/word-game";

export default function WordTeamsStep({
  value,
  onChange,
}: {
  value: WordSetup;
  onChange: (next: WordSetup) => void;
}) {
  const { t } = useLang();
  const setTeam = (i: number, team: WordTeam) =>
    onChange({ ...value, teams: value.teams.map((x, j) => (j === i ? team : x)) as [WordTeam, WordTeam] });
  const field = "min-w-0 flex-1 rounded bg-transparent placeholder:text-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40";

  return (
    <div className="space-y-4">
      {value.teams.map((team, i) => (
        <section
          key={i}
          className="space-y-2 rounded-2xl p-3"
          style={{ backgroundColor: teamColor(i), color: GAME_THEME.ink }}
        >
          <input
            value={team.name}
            onChange={(e) => setTeam(i, { ...team, name: e.target.value })}
            placeholder={t.wordTeamName}
            aria-label={t.wordTeamName}
            className={`${field} w-full text-xl font-bold`}
          />
          {team.players.map((name, p) => (
            <div key={p} className="flex items-center gap-2 rounded-xl bg-white/35 px-3 py-2">
              <input
                value={name}
                onChange={(e) =>
                  setTeam(i, { ...team, players: team.players.map((x, j) => (j === p ? e.target.value : x)) })
                }
                placeholder={t.wordPlayerName}
                aria-label={t.wordPlayerName}
                className={`${field} text-lg font-semibold`}
              />
              <button
                type="button"
                onClick={() => setTeam(i, { ...team, players: team.players.filter((_, j) => j !== p) })}
                className="rounded-lg p-1 hover:bg-black/10"
                aria-label={t.wordRemovePlayer}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={team.players.length >= WORD_MAX_TEAM}
            onClick={() => setTeam(i, { ...team, players: [...team.players, ""] })}
            className="w-full rounded-xl border border-dashed border-black/30 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50"
          >
            + {t.wordAddPlayer}
          </button>
        </section>
      ))}
      <button
        type="button"
        onClick={() => onChange(shuffleTeams(value, Math.random))}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
      >
        <Shuffle className="h-4 w-4" />
        {t.wordShuffle}
      </button>
    </div>
  );
}
