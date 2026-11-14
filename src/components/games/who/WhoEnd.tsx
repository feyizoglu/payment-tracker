"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate, whoWinners } from "@/lib/who-game";
import WhoScores from "./WhoScores";

export default function WhoEnd({
  names,
  colors,
  scores,
  onPlayAgain,
  onNewGame,
}: {
  names: readonly string[];
  colors: readonly string[];
  scores: readonly number[];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const winners = whoWinners(scores);
  const winner = winners.length === 1 ? winners[0] : null;

  return (
    <div className="space-y-6 py-4 text-center">
      {winner === null ? (
        <p className="text-4xl font-bold">{t.whoTie}</p>
      ) : (
        <p
          className="break-words rounded-2xl px-4 py-6 text-4xl font-bold"
          style={{ backgroundColor: colors[winner], color: GAME_THEME.ink }}
        >
          {fillTemplate(t.whoWins, { name: names[winner] })}
        </p>
      )}
      <WhoScores names={names} colors={colors} scores={scores} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.whoNewGame}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.whoPlayAgain}
        </button>
      </div>
    </div>
  );
}
