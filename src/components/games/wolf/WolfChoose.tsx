"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, canGoOn, pickOptions, visitResult, visitTask, type GameState } from "@/lib/wolf-game";
import WolfPicker from "./WolfPicker";
import WolfWitch from "./WolfWitch";

// The open half of a night visit, on the visitor's colour. It reads the same for every role;
// what the role is for stays on the held card.
export default function WolfChoose({
  state,
  onPick,
  onHeal,
  onNext,
}: {
  state: GameState;
  onPick: (seat: number) => void;
  onHeal: () => void;
  onNext: () => void;
}) {
  const { t } = useLang();
  const night = state.night;
  const task = visitTask(state);
  if (!night || !task) return null;
  const names = state.setup.players;
  const seat = night.order[night.visit];
  const result = visitResult(state, t);

  return (
    <div className="space-y-6 text-center">
      <p className="text-2xl font-bold">{names[seat]}</p>
      {task === "witch" ? (
        <WolfWitch state={state} onHeal={onHeal} onPick={onPick} />
      ) : (
        <>
          <p className="text-xl font-bold">{t.wolfChoosePlayer}</p>
          <WolfPicker options={pickOptions(state)} names={names} selected={night.picks[seat]} onPick={onPick} />
          {result && (
            <p className="text-xl font-bold" aria-live="polite">
              {result}
            </p>
          )}
        </>
      )}
      <button
        type="button"
        disabled={!canGoOn(state)}
        onClick={onNext}
        className="rounded-lg px-10 py-3 font-semibold disabled:opacity-40"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.imposterNextPlayer}
      </button>
    </div>
  );
}
