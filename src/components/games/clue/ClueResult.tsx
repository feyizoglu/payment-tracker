"use client";

import { useLang } from "@/lib/i18n";
import {
  CLUE_OUTCOME_KEYS,
  CLUE_OUTCOME_LOOK,
  CLUE_STRIKE_KEYS,
  clueStrikeReason,
  fillTemplate,
  type ClueRoundResult,
} from "@/lib/clue-game";

// The round is over: the word, the result and every clue are shown to the whole table.
export default function ClueResult({
  result,
  round,
  total,
  score,
  onNext,
}: {
  result: ClueRoundResult;
  /** 1-based. */
  round: number;
  total: number;
  score: number;
  onNext: () => void;
}) {
  const { t } = useLang();
  const look = CLUE_OUTCOME_LOOK[result.outcome];

  return (
    <div className="space-y-5 text-center">
      <p className="text-sm font-semibold text-gray-500">
        {fillTemplate(t.clueRound, { n: String(round), total: String(total) })} ·{" "}
        {fillTemplate(t.clueScoreSoFar, { n: String(score) })}
      </p>
      <div className="space-y-1">
        <p className="text-sm text-gray-500">{t.clueWordWas}</p>
        <p className="break-words text-4xl font-black text-gray-900">{result.word.word}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: look.color }}>
        <span aria-hidden="true">{look.mark} </span>
        {t[CLUE_OUTCOME_KEYS[result.outcome]]}
      </p>
      <h3 className="text-sm font-medium text-gray-500">{t.clueClues}</h3>
      <ul className="space-y-2 text-left">
        {result.clues.map((c, i) => {
          const why = clueStrikeReason(c);
          return (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3"
            >
              <span className="min-w-0">
                <span className={`block break-words font-semibold ${why === null ? "text-gray-900" : "text-gray-400 line-through"}`}>
                  {c.text}
                </span>
                {why !== null && <span className="block text-xs text-gray-500">{t[CLUE_STRIKE_KEYS[why]]}</span>}
              </span>
              <span className="shrink-0 break-words text-sm text-gray-500">{c.giver}</span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onNext}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {t.clueNext}
      </button>
    </div>
  );
}
