"use client";

import { GAME_THEME, playerColor } from "@/lib/wolf-game";

export interface PickOption {
  seat: number;
  enabled: boolean;
}

// One button per player, in that player's colour. A check mark, not only the border, shows
// the pick.
export default function WolfPicker({
  options,
  names,
  selected,
  onPick,
  note,
}: {
  options: PickOption[];
  names: string[];
  selected: number | null;
  onPick: (seat: number) => void;
  /** A second line under the name, e.g. the role on the narrator's screen. */
  note?: (seat: number) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ seat, enabled }) => {
        const chosen = selected === seat;
        return (
          <button
            key={seat}
            type="button"
            disabled={!enabled}
            aria-pressed={chosen}
            onClick={() => onPick(seat)}
            className={`rounded-xl py-3 font-semibold disabled:opacity-40 ${chosen ? "border-4" : "border-2"}`}
            style={{
              backgroundColor: playerColor(seat),
              color: GAME_THEME.ink,
              borderColor: chosen ? GAME_THEME.text : GAME_THEME.bg,
            }}
          >
            {chosen ? "✓ " : ""}
            {names[seat]}
            {note && <span className="block text-xs font-normal">{note(seat)}</span>}
          </button>
        );
      })}
    </div>
  );
}
