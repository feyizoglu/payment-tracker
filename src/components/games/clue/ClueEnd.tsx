"use client";

import { useLang } from "@/lib/i18n";
import {
  CLUE_OUTCOME_KEYS,
  CLUE_OUTCOME_LOOK,
  clueRating,
  clueScore,
  fillTemplate,
  type ClueRoundResult,
} from "@/lib/clue-game";

export default function ClueEnd({
  results,
  onPlayAgain,
  onNewGame,
}: {
  results: readonly ClueRoundResult[];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const score = clueScore(results);
  const total = results.length;

  return (
    <div className="space-y-6 py-4 text-center">
      <p className="text-5xl font-black">{fillTemplate(t.clueEndScore, { n: String(score), total: String(total) })}</p>
      <p className="text-lg font-semibold">{t[clueRating(score, total)]}</p>
      <h3 className="text-sm font-medium text-gray-500">{t.clueWords}</h3>
      <ul className="space-y-2 text-left">
        {results.map((r, i) => {
          const look = CLUE_OUTCOME_LOOK[r.outcome];
          return (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3"
            >
              <span className="min-w-0 break-words text-gray-900">{r.word.word}</span>
              <span className="shrink-0 text-sm font-semibold" style={{ color: look.color }}>
                <span aria-hidden="true">{look.mark} </span>
                {t[CLUE_OUTCOME_KEYS[r.outcome]]}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onNewGame}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.clueNewGame}
        </button>
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.cluePlayAgain}
        </button>
      </div>
    </div>
  );
}
