"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate, scaleWinner, teamColor, type WordTeam } from "@/lib/scale-game";
import WordScores from "../word/WordScores";

export default function ScaleEnd({
  teams,
  scores,
  onPlayAgain,
  onNewGame,
}: {
  teams: readonly WordTeam[];
  scores: readonly [number, number];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const win = scaleWinner(scores);

  return (
    <div className="space-y-6 py-4 text-center">
      {win === null ? (
        <p className="text-4xl font-bold">{t.scaleTie}</p>
      ) : (
        <p
          className="break-words rounded-2xl px-4 py-6 text-4xl font-bold"
          style={{ backgroundColor: teamColor(win), color: GAME_THEME.ink }}
        >
          {fillTemplate(t.scaleWins, { team: teams[win].name })}
        </p>
      )}
      <WordScores teams={teams} scores={scores} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.scaleNewGame}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.scalePlayAgain}
        </button>
      </div>
    </div>
  );
}
