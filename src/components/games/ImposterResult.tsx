"use client";

import { useLang } from "@/lib/i18n";
import type { GameState } from "@/lib/imposter";

export default function ImposterResult({
  state,
  onNextRound,
  onEnd,
}: {
  state: GameState;
  onNextRound: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  const { round, outcome, setup, scores } = state;
  if (!round) return null;
  const names = setup.players;

  return (
    <div className="space-y-5 text-center">
      {outcome && (
        <div className="space-y-1">
          <p className="text-sm text-gray-500">
            {outcome.accused === null ? t.imposterTie : t.imposterAccused.replace("{name}", names[outcome.accused])}
          </p>
          <p className={`text-2xl font-bold ${outcome.crewWins ? "text-green-600" : "text-red-600"}`}>
            {outcome.crewWins ? t.imposterCrewWins : t.imposterImpostersWin}
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-gray-100 bg-surface p-4 text-left">
        <p className="text-gray-900">
          <span className="text-gray-500">{t.imposterTheWord}: </span>
          <b>{round.word}</b>
        </p>
        {setup.mode === "similar-word" && (
          <p className="text-gray-900">
            <span className="text-gray-500">{t.imposterThePair}: </span>
            <b>{round.pair}</b>
          </p>
        )}
        <p className="text-gray-900">
          <span className="text-gray-500">{t.imposterWere}: </span>
          <b>{round.imposters.map((i) => names[i]).join(", ")}</b>
        </p>
      </div>

      {setup.scoreboard && (
        <div className="rounded-xl border border-gray-100 bg-surface p-4 text-left">
          <p className="mb-2 text-sm font-medium text-gray-500">{t.imposterScores}</p>
          {names
            .map((name, i) => ({ name, score: scores[i] }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score }) => (
              <div key={name} className="flex justify-between py-1 text-gray-900">
                <span>{name}</span>
                <b>{score}</b>
              </div>
            ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onEnd}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.imposterEnd}
        </button>
        <button
          type="button"
          onClick={onNextRound}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.imposterNextRound}
        </button>
      </div>
    </div>
  );
}
