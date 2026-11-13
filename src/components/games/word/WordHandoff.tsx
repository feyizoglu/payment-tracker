"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate, type WordTeam } from "@/lib/word-game";
import WordScores from "./WordScores";

// Hands the phone to the next describer. It sits on that team's colour.
export default function WordHandoff({
  describer,
  teamName,
  teams,
  scores,
  onBegin,
  onEnd,
}: {
  describer: string;
  teamName: string;
  teams: readonly WordTeam[];
  scores: readonly number[];
  onBegin: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-6 py-4 text-center">
      <p className="text-2xl font-bold">
        {fillTemplate(t.wordGiveTo, { name: describer, team: teamName })}
      </p>
      <p className="text-sm opacity-80">{t.wordHandoffHint}</p>
      <WordScores teams={teams} scores={scores} />
      <button
        type="button"
        onClick={onBegin}
        className="w-full rounded-lg py-3 text-lg font-semibold"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.wordBegin}
      </button>
      <button type="button" onClick={onEnd} className="text-sm font-semibold underline opacity-80">
        {t.wordEndGame}
      </button>
    </div>
  );
}
