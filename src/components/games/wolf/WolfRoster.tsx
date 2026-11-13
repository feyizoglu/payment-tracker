"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, ROLE_NAME_KEYS, playerColor, type GameState } from "@/lib/wolf-game";

// The narrator's list of every player's role, shown once after the deal.
export default function WolfRoster({ state, onStart }: { state: GameState; onStart: () => void }) {
  const { t } = useLang();
  return (
    <div className="space-y-4 text-left">
      <p className="text-center text-xl font-bold">{t.wolfAllRoles}</p>
      <ul className="space-y-2">
        {state.setup.players.map((name, seat) => (
          <li
            key={seat}
            className="flex items-center justify-between rounded-xl px-3 py-2"
            style={{ backgroundColor: playerColor(seat), color: GAME_THEME.ink }}
          >
            <span className="font-semibold">{name}</span>
            <span>{t[ROLE_NAME_KEYS[state.roles[seat]]]}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-lg py-3 font-semibold"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.wolfStartNight}
      </button>
    </div>
  );
}
