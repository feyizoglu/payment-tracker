"use client";

import { useLang } from "@/lib/i18n";
import { canHeal, pickOptions, type GameState } from "@/lib/wolf-game";
import WolfPicker from "./WolfPicker";

// The witch's choices on the narrator's witch line: only the narrator sees this screen.
export default function WolfWitch({
  state,
  onHeal,
  onPick,
  note,
}: {
  state: GameState;
  onHeal: () => void;
  onPick: (seat: number) => void;
  note?: (seat: number) => string;
}) {
  const { t } = useLang();
  const night = state.night;
  if (!night) return null;
  const names = state.setup.players;
  const victim = night.victim;
  const { heal, poison } = state.potions;

  return (
    <div className="space-y-4">
      {victim !== null && <p className="text-lg font-semibold">{t.wolfTaskWitch.replace("{name}", () => names[victim])}</p>}
      {!heal && !poison && <p>{t.wolfNoPotions}</p>}
      {victim !== null && canHeal(state) && (
        <button
          type="button"
          aria-pressed={night.heal}
          onClick={onHeal}
          className={`w-full rounded-xl border-current py-3 font-semibold ${night.heal ? "border-4" : "border-2"}`}
        >
          {night.heal ? "✓ " : ""}
          {t.wolfHeal.replace("{name}", () => names[victim])}
        </button>
      )}
      {poison && (
        <div className="space-y-2">
          <p className="font-semibold">{t.wolfPoison}</p>
          <WolfPicker options={pickOptions(state)} names={names} selected={night.poison} onPick={onPick} note={note} />
        </div>
      )}
    </div>
  );
}
