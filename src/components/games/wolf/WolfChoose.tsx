"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, pickOptions, visitTask, type GameState } from "@/lib/wolf-game";
import WolfPicker from "./WolfPicker";

// The open half of a night visit, on the visitor's colour. The table can see it, so it is the
// same for every role: every living player, all alike (and Nobody on the witch lap), and a tap
// moves on to the held result.
export default function WolfChoose({
  state,
  onPick,
}: {
  state: GameState;
  /** null is Nobody. */
  onPick: (seat: number | null) => void;
}) {
  const { t } = useLang();
  const night = state.night;
  if (!night || !visitTask(state)) return null;
  const names = state.setup.players;
  const seat = night.order[night.visit];

  return (
    <div className="space-y-6 text-center">
      <p className="text-2xl font-bold">{names[seat]}</p>
      <p className="text-xl font-bold">{t.wolfChoosePlayer}</p>
      <WolfPicker options={pickOptions(state)} names={names} selected={null} onPick={onPick} />
      {night.lap === "witch" && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className="w-full rounded-xl border-2 py-3 font-semibold"
          style={{ borderColor: GAME_THEME.bg }}
        >
          {t.wolfNobody}
        </button>
      )}
    </div>
  );
}
