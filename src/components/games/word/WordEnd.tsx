"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, teamColor, winner, type WordTeam } from "@/lib/word-game";
import WordScores from "./WordScores";

export default function WordEnd({
  teams,
  scores,
  outOfWords,
  onPlayAgain,
  onNewGame,
}: {
  teams: readonly WordTeam[];
  scores: readonly [number, number];
  outOfWords: boolean;
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const win = winner(scores);
  return (
    <div className="space-y-6 py-4 text-center">
      {outOfWords && <p className="text-sm text-gray-500">{t.wordNoWordsLeft}</p>}
      <p className="text-3xl font-bold" style={{ color: win === null ? GAME_THEME.text : teamColor(win) }}>
        {win === null ? t.wordDraw : t.wordWins.replace("{team}", () => teams[win].name)}
      </p>
      <WordScores teams={teams} scores={scores} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.wordNewGame}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.wordPlayAgain}
        </button>
      </div>
    </div>
  );
}
