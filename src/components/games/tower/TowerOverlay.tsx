"use client";

import { fillTemplate } from "@/lib/word-game";
import { useLang } from "@/lib/i18n";
import type { TowerPhase } from "@/lib/book-tower";

export default function TowerOverlay({
  phase,
  score,
  perfect,
  best,
  newBest,
  guard,
  ink,
  onAgain,
}: {
  phase: TowerPhase;
  score: number;
  /** "Perfect!" shows under the score right after a perfect drop. */
  perfect: boolean;
  best: number;
  newBest: boolean;
  guard: boolean;
  /** Text colour over the page, from the page's palette: the app's gray classes flip in the dark theme. */
  ink: string;
  onAgain: () => void;
}) {
  const { t } = useLang();
  const digits = "font-bold italic tracking-tight";
  if (phase === "playing") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-4 text-center" style={{ color: ink }}>
        <p className={`text-5xl ${digits}`}>{score}</p>
        {perfect && <p className="text-lg font-semibold">{t.towerPerfect}</p>}
      </div>
    );
  }
  if (phase === "ready" || phase === "paused") {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ color: ink }}>
        {phase === "ready" ? <p className="text-sm">{fillTemplate(t.planeBest, { n: String(best) })}</p> : <p className={`text-5xl ${digits}`}>{score}</p>}
        <p className="text-lg font-semibold">{phase === "ready" ? t.planeTapToStart : t.planeTapToContinue}</p>
        {phase === "ready" && <p className="text-xs opacity-70">{t.towerKeyHint}</p>}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-6">
      <div className="w-full max-w-xs space-y-3 rounded-2xl bg-surface p-5 text-center text-gray-900 shadow-lg">
        <p className="text-sm text-gray-500">{t.planeScore}</p>
        <p className={`text-5xl ${digits}`}>{score}</p>
        {newBest ? <p className="font-semibold text-amber-600 dark:text-amber-400">{t.planeNewBest}</p> : <p className="text-sm">{fillTemplate(t.planeBest, { n: String(best) })}</p>}
        <div className="flex gap-2 pt-2">
          <a href="/games" aria-disabled={guard} className={`flex-1 rounded-lg border border-gray-200 py-2 text-sm ${guard ? "pointer-events-none opacity-50" : ""}`}>
            {t.planeBackToGames}
          </a>
          <button type="button" disabled={guard} onClick={onAgain} className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t.planeAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
