"use client";

import { useLang } from "@/lib/i18n";
import {
  WORD_RESULT_KEYS,
  WORD_RESULT_LOOK,
  signedPoints,
  teamColor,
  turnPoints,
  type TurnResult,
  type WordTeam,
} from "@/lib/word-game";
import WordScores from "./WordScores";

export default function WordSummary({
  team,
  teams,
  scores,
  results,
  outOfWords,
  onNext,
  onEnd,
}: {
  team: number;
  teams: readonly WordTeam[];
  scores: readonly number[];
  results: readonly TurnResult[];
  outOfWords: boolean;
  onNext: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-5 text-center">
      <p className="text-3xl font-bold">{outOfWords ? t.wordNoWordsLeft : t.wordTimeUp}</p>
      <p className="font-semibold" style={{ color: teamColor(team) }}>
        {t.wordTurnPoints.replace("{team}", () => teams[team].name).replace("{points}", signedPoints(turnPoints(results)))}
      </p>
      {results.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-surface text-left">
          {results.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="text-gray-900">{r.card.word}</span>
              <span className="shrink-0 text-sm font-semibold" style={{ color: WORD_RESULT_LOOK[r.result].color }}>
                {WORD_RESULT_LOOK[r.result].mark} {t[WORD_RESULT_KEYS[r.result]]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <WordScores teams={teams} scores={scores} />
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onEnd}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.wordEndGame}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.wordNext}
        </button>
      </div>
    </div>
  );
}
