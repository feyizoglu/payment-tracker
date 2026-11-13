"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, ROLE_NAME_KEYS, playerColor, type GameState } from "@/lib/wolf-game";

export default function WolfEnd({
  state,
  onPlayAgain,
  onNewGame,
}: {
  state: GameState;
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const village = state.winner === "village";

  return (
    <div className="space-y-5 text-center">
      <p className={`text-4xl font-bold ${village ? "text-green-600" : "text-red-600"}`}>
        {village ? t.wolfVillageWins : t.wolfWolvesWin}
      </p>
      <ul className="space-y-2 text-left">
        {state.setup.players.map((name, seat) => (
          <li
            key={seat}
            className={`flex items-center justify-between rounded-xl px-3 py-2 ${state.alive[seat] ? "" : "opacity-60"}`}
            style={{ backgroundColor: playerColor(seat), color: GAME_THEME.ink }}
          >
            <span className={`font-semibold ${state.alive[seat] ? "" : "line-through"}`}>{name}</span>
            <span>{t[ROLE_NAME_KEYS[state.roles[seat]]]}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.wolfNewGame}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.wolfPlayAgain}
        </button>
      </div>
    </div>
  );
}
