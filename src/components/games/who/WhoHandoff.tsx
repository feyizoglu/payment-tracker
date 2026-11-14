"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate } from "@/lib/who-game";

// Render on the guesser's (or their team's) colour. Start is large: the guesser may tap it
// with the phone already on their forehead.
export default function WhoHandoff({
  guesser,
  team,
  round,
  rounds,
  onStart,
}: {
  guesser: string;
  /** The guesser's team, or null in a solo game. */
  team: string | null;
  round: number;
  rounds: number;
  onStart: () => void;
}) {
  const { t } = useLang();
  const title =
    team === null ? fillTemplate(t.whoGuesses, { name: guesser }) : fillTemplate(t.whoTeamGuesses, { team, name: guesser });

  return (
    <div className="space-y-6 py-4 text-center">
      <p className="text-sm font-semibold opacity-80">
        {fillTemplate(t.whoRound, { n: String(round), total: String(rounds) })}
      </p>
      <p className="break-words text-3xl font-bold">{title}</p>
      <p className="text-sm opacity-80">{t.whoHandoffHint}</p>
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-2xl py-16 text-3xl font-black"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.whoStart}
      </button>
    </div>
  );
}
