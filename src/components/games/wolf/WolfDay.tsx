"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  GAME_THEME,
  ROLE_NAME_KEYS,
  formatCountdown,
  livingSeats,
  playerColor,
  remainingSeconds,
  type GameState,
} from "@/lib/wolf-game";
import WolfPicker from "./WolfPicker";
import WolfRulesButton from "./WolfRulesButton";

// The day: the table talks (with the optional timer), then the phone holder enters the vote.
// The timer counts to the day's end time in the game state, so leaving for the rules does
// not restart it.
export default function WolfDay({
  state,
  onVote,
  onTalk,
  onVoteOut,
  onRules,
}: {
  state: GameState;
  onVote: () => void;
  onTalk: () => void;
  onVoteOut: (seat: number | null) => void;
  onRules: () => void;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  const ticking = state.setup.timerMinutes > 0 && state.dayStep === "talk";

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticking]);

  const names = state.setup.players;
  const living = livingSeats(state);
  const chip = (seat: number) => ({ backgroundColor: playerColor(seat), color: GAME_THEME.ink });

  if (state.dayStep === "vote") {
    return (
      <div className="space-y-5 text-center">
        <p className="text-xl font-bold text-gray-900">{t.wolfVoteQuestion}</p>
        <WolfPicker
          options={living.map((seat) => ({ seat, enabled: true }))}
          names={names}
          selected={null}
          onPick={onVoteOut}
        />
        <button
          type="button"
          onClick={() => onVoteOut(null)}
          className="w-full rounded-xl border-2 border-gray-200 py-3 font-semibold text-gray-900"
        >
          {t.wolfNobody}
        </button>
        <button type="button" onClick={onTalk} className="text-sm text-gray-500">
          {t.back}
        </button>
      </div>
    );
  }

  const left = remainingSeconds(state.dayEndsAt, now);
  const out = names.flatMap((_, seat) => (state.alive[seat] ? [] : [seat]));

  return (
    <div className="space-y-5 text-center">
      <WolfRulesButton onClick={onRules} />
      <p className="text-2xl font-bold text-gray-900">{t.wolfDayN.replace("{n}", String(state.night?.number ?? 1))}</p>
      {state.setup.timerMinutes > 0 && (
        <p className={`font-mono text-5xl ${left === 0 ? "text-red-600" : "text-gray-900"}`}>
          {left === 0 ? t.imposterTimeUp : formatCountdown(left)}
        </p>
      )}
      <section className="space-y-2 text-left">
        <h3 className="text-sm font-medium text-gray-500">{t.wolfInGame}</h3>
        <div className="flex flex-wrap gap-2">
          {living.map((seat) => (
            <span key={seat} className="rounded-full px-3 py-1 font-semibold" style={chip(seat)}>
              {names[seat]}
            </span>
          ))}
        </div>
      </section>
      {out.length > 0 && (
        <section className="space-y-2 text-left">
          <h3 className="text-sm font-medium text-gray-500">{t.wolfOut}</h3>
          <div className="flex flex-wrap gap-2">
            {out.map((seat) => (
              <span key={seat} className="rounded-full px-3 py-1 opacity-60" style={chip(seat)}>
                <span className="line-through">{names[seat]}</span>
                {state.setup.showRoles && ` · ${t[ROLE_NAME_KEYS[state.roles[seat]]]}`}
              </span>
            ))}
          </div>
        </section>
      )}
      <button
        type="button"
        onClick={onVote}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {t.wolfVote}
      </button>
    </div>
  );
}
