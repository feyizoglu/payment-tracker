"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, ROLE_NAME_KEYS, livingSeats, pendingShot, playerColor, type GameState } from "@/lib/wolf-game";
import WolfPicker from "./WolfPicker";
import WolfRulesButton from "./WolfRulesButton";

// Who the night (the morning) or the vote removed, and a removed hunter's shot.
export default function WolfRemoval({
  state,
  onShoot,
  onContinue,
  onRules,
}: {
  state: GameState;
  onShoot: (seat: number) => void;
  onContinue: () => void;
  onRules?: () => void;
}) {
  const { t } = useLang();
  const removal = state.removal;
  if (!removal) return null;
  const names = state.setup.players;
  const morning = state.phase === "morning";
  const { hunter, shot } = removal;
  const row = (seat: number) => (
    <li
      key={seat}
      className="flex items-center justify-between rounded-xl px-3 py-2"
      style={{ backgroundColor: playerColor(seat), color: GAME_THEME.ink }}
    >
      <span className="font-semibold">{names[seat]}</span>
      {state.setup.showRoles && <span>{t[ROLE_NAME_KEYS[state.roles[seat]]]}</span>}
    </li>
  );

  return (
    <div className="space-y-5 text-center">
      {onRules && <WolfRulesButton onClick={onRules} />}
      <p className="text-2xl font-bold text-gray-900">{morning ? t.wolfMorning : t.wolfVote}</p>
      {removal.removed.length === 0 ? (
        <p className="text-gray-900">{morning ? t.wolfNobodyRemoved : t.wolfNobodyVotedOut}</p>
      ) : (
        <section className="space-y-2 text-left">
          <h3 className="text-sm font-medium text-gray-500">{morning ? t.wolfRemovedTonight : t.wolfVotedOut}</h3>
          <ul className="space-y-2">{removal.removed.map(row)}</ul>
        </section>
      )}
      {hunter !== null && (
        <section className="space-y-3">
          <p className="font-semibold text-gray-900">
            {shot === null
              ? t.wolfHunterShoots.replace("{name}", () => names[hunter])
              : t.wolfHunterShot.replace("{name}", () => names[hunter]).replace("{target}", () => names[shot])}
          </p>
          {shot === null ? (
            <WolfPicker
              options={livingSeats(state).map((seat) => ({ seat, enabled: true }))}
              names={names}
              selected={null}
              onPick={onShoot}
            />
          ) : (
            <ul className="text-left">{row(shot)}</ul>
          )}
        </section>
      )}
      {!pendingShot(state) && (
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.wolfContinue}
        </button>
      )}
    </div>
  );
}
