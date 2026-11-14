"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate, playerColor } from "@/lib/hot-potato";

export default function PotatoEnd({
  players,
  winner,
  outOrder,
  onPlayAgain,
  onNewGame,
}: {
  players: string[];
  winner: number;
  /** Seats in the order they went out. */
  outOrder: number[];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();

  return (
    <div className="space-y-5 text-center">
      <p
        className="break-words rounded-2xl px-4 py-6 text-4xl font-bold"
        style={{ backgroundColor: playerColor(winner), color: GAME_THEME.ink }}
      >
        {fillTemplate(t.potatoWins, { name: players[winner] })}
      </p>
      <div className="space-y-2 text-left">
        <h3 className="text-sm font-medium text-gray-500">{t.potatoOutOrder}</h3>
        <ol className="list-inside list-decimal space-y-2">
          {outOrder.map((seat) => (
            <li
              key={seat}
              className="rounded-xl px-3 py-2 font-semibold"
              style={{ backgroundColor: playerColor(seat), color: GAME_THEME.ink }}
            >
              {players[seat]}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.potatoNewGame}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.potatoPlayAgain}
        </button>
      </div>
    </div>
  );
}
