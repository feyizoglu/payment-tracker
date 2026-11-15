"use client";

import { useLang } from "@/lib/i18n";
import {
  CLUE_ANSWER_KEYS,
  CLUE_OUTCOMES,
  CLUE_OUTCOME_LOOK,
  GAME_THEME,
  fillTemplate,
  type ClueOutcome,
} from "@/lib/clue-game";

// The guesser's screen, on their colour: the surviving clues only, never the word or the
// writers. With no clue left the word can only be passed.
export default function ClueGuess({
  guesser,
  clues,
  onAnswer,
}: {
  guesser: string;
  clues: readonly string[];
  onAnswer: (outcome: ClueOutcome) => void;
}) {
  const { t } = useLang();
  const none = clues.length === 0;
  const answers: readonly ClueOutcome[] = none ? ["passed"] : CLUE_OUTCOMES;

  return (
    <div className="space-y-6 py-4 text-center">
      <p className="break-words text-xl font-bold">{fillTemplate(t.clueGuessHint, { name: guesser })}</p>
      {none ? (
        <p className="text-lg font-semibold">{t.clueNoClues}</p>
      ) : (
        <ul className="space-y-3">
          {clues.map((clue, i) => (
            <li
              key={i}
              className="break-words rounded-2xl bg-white/80 px-4 py-4 text-3xl font-black"
              style={{ color: GAME_THEME.ink }}
            >
              {clue}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        {answers.map((outcome) => (
          <button
            key={outcome}
            type="button"
            onClick={() => onAnswer(outcome)}
            className="flex-1 rounded-xl py-4 text-lg font-bold"
            style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
          >
            <span aria-hidden="true">{CLUE_OUTCOME_LOOK[outcome].mark} </span>
            {t[CLUE_ANSWER_KEYS[outcome]]}
          </button>
        ))}
      </div>
    </div>
  );
}
