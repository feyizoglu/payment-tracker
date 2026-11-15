"use client";

import { useLang } from "@/lib/i18n";
import { CLUE_STRIKE_KEYS, clueStrikeReason, fillTemplate, type ClueEntry } from "@/lib/clue-game";

// For the clue givers only: the word, every clue and its writer. A tap strikes or restores a
// clue; the label says which, not only the line through it.
export default function ClueCheck({
  word,
  guesser,
  clues,
  onStrike,
  onDone,
}: {
  word: string;
  guesser: string;
  clues: readonly ClueEntry[];
  onStrike: (index: number) => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-5 text-center">
      <p className="break-words text-sm font-semibold text-gray-500">{fillTemplate(t.clueCheckHint, { name: guesser })}</p>
      <div className="space-y-1">
        <p className="text-sm text-gray-500">{t.clueTheWord}</p>
        <p className="break-words text-4xl font-black text-gray-900">{word}</p>
      </div>
      <p className="text-sm text-gray-500">{t.clueCheckIntro}</p>
      <ul className="space-y-2 text-left">
        {clues.map((c, i) => {
          const why = clueStrikeReason(c);
          const reason = why === null ? null : t[CLUE_STRIKE_KEYS[why]];
          const label =
            reason === null
              ? fillTemplate(t.clueKeptLabel, { clue: c.text, name: c.giver })
              : fillTemplate(t.clueStruckLabel, { clue: c.text, name: c.giver, reason });
          return (
            <li key={i}>
              <button
                type="button"
                aria-label={label}
                onClick={() => onStrike(i)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3 hover:bg-gray-100"
              >
                <span className="min-w-0">
                  <span
                    className={`block break-words text-lg font-semibold ${reason === null ? "text-gray-900" : "text-gray-400 line-through"}`}
                  >
                    {c.text}
                  </span>
                  {reason !== null && <span className="block text-xs text-gray-500">{reason}</span>}
                </span>
                <span className="shrink-0 break-words text-sm text-gray-500">{c.giver}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {fillTemplate(t.clueToGuess, { name: guesser })}
      </button>
    </div>
  );
}
