"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate, type WordTeam } from "@/lib/scale-game";
import WordScores from "../word/WordScores";

// Hands the phone to the clue giver. It sits on their team's colour.
export default function ScaleHandoff({
  team,
  giver,
  turn,
  turns,
  teams,
  scores,
  onShow,
}: {
  team: string;
  giver: string;
  /** The team's turn, 1-based. */
  turn: number;
  /** Turns per team. */
  turns: number;
  teams: readonly WordTeam[];
  scores: readonly number[];
  onShow: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-6 py-4 text-center">
      <p className="text-sm font-semibold opacity-80">{fillTemplate(t.scaleTurnOf, { n: String(turn), total: String(turns) })}</p>
      <p className="break-words text-3xl font-bold">{fillTemplate(t.scaleGives, { team, name: giver })}</p>
      <p className="break-words opacity-80">{fillTemplate(t.scaleOnlyLooks, { name: giver })}</p>
      <WordScores teams={teams} scores={scores} />
      <button
        type="button"
        onClick={onShow}
        className="w-full rounded-lg py-3 text-lg font-semibold"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.scaleShowTarget}
      </button>
    </div>
  );
}
