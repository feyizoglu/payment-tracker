"use client";

import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME, MAX_PLAYERS, playerColor } from "@/lib/imposter";

// Any game's setup with a player list: Imposter's and Wolf Night's.
export default function SetupPlayersStep<S extends { players: string[] }>({
  value,
  onChange,
}: {
  value: S;
  onChange: (next: S) => void;
}) {
  const { t } = useLang();
  const setPlayers = (players: string[]) => onChange({ ...value, players });

  return (
    <div className="space-y-2">
      {value.players.map((name, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: playerColor(i) }}>
          <input
            value={name}
            onChange={(e) => setPlayers(value.players.map((p, j) => (j === i ? e.target.value : p)))}
            placeholder={t.imposterPlayerName}
            aria-label={t.imposterPlayerName}
            className="min-w-0 flex-1 rounded bg-transparent text-lg font-semibold placeholder:text-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
            style={{ color: GAME_THEME.ink }}
          />
          <button
            type="button"
            onClick={() => setPlayers(value.players.filter((_, j) => j !== i))}
            className="rounded-lg p-1 hover:bg-black/10"
            style={{ color: GAME_THEME.ink }}
            aria-label={t.imposterRemovePlayer}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={value.players.length >= MAX_PLAYERS}
        onClick={() => setPlayers([...value.players, ""])}
        className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
      >
        + {t.imposterAddPlayer}
      </button>
    </div>
  );
}
