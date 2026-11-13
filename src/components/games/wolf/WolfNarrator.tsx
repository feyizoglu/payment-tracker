"use client";

import { useLang } from "@/lib/i18n";
import {
  NARRATOR_LINE_KEYS,
  ROLE_NAME_KEYS,
  canGoOn,
  lineRemoved,
  narratorLine,
  pickOptions,
  type GameState,
} from "@/lib/wolf-game";
import WolfPicker from "./WolfPicker";
import WolfRulesButton from "./WolfRulesButton";
import WolfWitch from "./WolfWitch";

// The narrator's night, one line at a time. The narrator does not play, so the player
// buttons show every role.
export default function WolfNarrator({
  state,
  onPick,
  onHeal,
  onNext,
  onRules,
}: {
  state: GameState;
  onPick: (seat: number) => void;
  onHeal: () => void;
  onNext: () => void;
  onRules: () => void;
}) {
  const { t } = useLang();
  const night = state.night;
  const line = narratorLine(state);
  if (!night || !line) return null;
  const names = state.setup.players;
  const removed = lineRemoved(state);
  const role = (seat: number) => t[ROLE_NAME_KEYS[state.roles[seat]]];
  const picker = (selected: number | null) => (
    <WolfPicker options={pickOptions(state)} names={names} selected={selected} onPick={onPick} note={role} />
  );
  const nothing = line === "witch" && !removed && !night.heal && night.poison === null;

  return (
    <div className="space-y-5 text-center">
      <WolfRulesButton onClick={onRules} />
      <p className="text-sm text-gray-500">{t.wolfNightN.replace("{n}", String(night.number))}</p>
      <p className="text-2xl font-bold text-gray-900">{t[NARRATOR_LINE_KEYS[line]]}</p>
      {removed && <p className="text-gray-500">{t.wolfLineRemoved}</p>}
      {line === "wolves" && picker(night.victim)}
      {line === "seer" && !removed && (
        <>
          {picker(night.seen)}
          {night.seen !== null && (
            <p className="text-3xl font-bold text-gray-900" aria-live="polite">
              {state.roles[night.seen] === "wolf" ? t.wolfIsWolf : t.wolfNotWolf}
            </p>
          )}
          <p className="text-sm text-gray-500">{t.wolfSeerThumb}</p>
        </>
      )}
      {line === "doctor" && !removed && picker(night.protect)}
      {line === "witch" && !removed && <WolfWitch state={state} onHeal={onHeal} onPick={onPick} note={role} />}
      <button
        type="button"
        disabled={!canGoOn(state)}
        onClick={onNext}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {nothing ? t.wolfNothing : t.wolfNext}
      </button>
    </div>
  );
}
