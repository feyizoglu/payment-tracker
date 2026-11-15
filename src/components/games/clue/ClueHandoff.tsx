"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate } from "@/lib/clue-game";

// Seen by the whole table, the guesser too: render it on the guesser's colour, never with the word.
export default function ClueHandoff({
  guesser,
  next,
  round,
  total,
  score,
  onBegin,
}: {
  guesser: string;
  /** The first clue giver, who takes the phone. */
  next: string;
  /** 1-based. */
  round: number;
  total: number;
  score: number;
  onBegin: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-6 py-4 text-center">
      <p className="text-sm font-semibold opacity-80">
        {fillTemplate(t.clueRound, { n: String(round), total: String(total) })} ·{" "}
        {fillTemplate(t.clueScoreSoFar, { n: String(score) })}
      </p>
      <p className="break-words text-3xl font-bold">{fillTemplate(t.clueGuesses, { name: guesser })}</p>
      <p className="break-words text-lg font-semibold">{fillTemplate(t.clueDontLook, { name: guesser, next })}</p>
      <button
        type="button"
        onClick={onBegin}
        className="w-full rounded-2xl py-4 text-xl font-bold"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.clueBegin}
      </button>
    </div>
  );
}
