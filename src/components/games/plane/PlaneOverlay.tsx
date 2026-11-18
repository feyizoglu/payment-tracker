"use client";

import { fillTemplate } from "@/lib/word-game";
import { useLang } from "@/lib/i18n";
import type { PlanePhase } from "@/lib/paper-plane";

export default function PlaneOverlay({
  phase,
  score,
  best,
  newBest,
  guard,
  onAgain,
}: {
  phase: PlanePhase;
  score: number;
  best: number;
  newBest: boolean;
  guard: boolean;
  onAgain: () => void;
}) {
  const { t } = useLang();
  const digits = "font-bold italic tracking-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]";
  if (phase === "flying") {
    return <p className={`pointer-events-none absolute inset-x-0 top-4 text-center text-5xl ${digits} text-gray-900 dark:text-gray-100`}>{score}</p>;
  }
  if (phase === "ready" || phase === "paused") {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-800 dark:text-gray-100">
        {phase === "ready" ? <p className="text-sm">{fillTemplate(t.planeBest, { n: String(best) })}</p> : <p className={`text-5xl ${digits}`}>{score}</p>}
        <p className="text-lg font-semibold">{phase === "ready" ? t.planeTapToStart : t.planeTapToContinue}</p>
        {phase === "ready" && <p className="text-xs opacity-70">{t.planeKeyHint}</p>}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-6">
      <div className="w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center text-gray-900 shadow-lg dark:bg-gray-800 dark:text-gray-100">
        <p className="text-sm text-gray-500">{t.planeScore}</p>
        <p className={`text-5xl ${digits}`}>{score}</p>
        {newBest ? <p className="font-semibold text-sky-600 dark:text-sky-400">{t.planeNewBest}</p> : <p className="text-sm">{fillTemplate(t.planeBest, { n: String(best) })}</p>}
        <div className="flex gap-2 pt-2">
          <a href="/games" aria-disabled={guard} className={`flex-1 rounded-lg border border-gray-200 py-2 text-sm ${guard ? "pointer-events-none opacity-50" : ""}`}>
            {t.planeBackToGames}
          </a>
          <button type="button" disabled={guard} onClick={onAgain} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t.planeAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
