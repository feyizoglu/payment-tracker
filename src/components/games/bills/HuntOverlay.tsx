"use client";

import { fillTemplate } from "@/lib/word-game";
import { useLang } from "@/lib/i18n";
import type { HuntPhase } from "@/lib/bill-hunt";

export default function HuntOverlay({
  phase,
  month,
  coins,
  score,
  sped,
  best,
  newBest,
  guard,
  ink,
  onStart,
  onSpeedUp,
  onCallBack,
  onAgain,
}: {
  phase: HuntPhase;
  month: number;
  coins: number;
  score: number;
  /** The throw already runs fast. */
  sped: boolean;
  best: number;
  newBest: boolean;
  guard: boolean;
  /** Text colour over the board, from the board's palette: the app's gray classes flip in the dark theme. */
  ink: string;
  onStart: () => void;
  onSpeedUp: () => void;
  onCallBack: () => void;
  onAgain: () => void;
}) {
  const { t } = useLang();
  if (phase === "ready") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ color: ink }}>
        <p className="text-sm">{fillTemplate(t.soloBest, { n: String(best) })}</p>
        <p className="max-w-xs text-sm opacity-80">{t.huntDesc}</p>
        <button type="button" onClick={onStart} className="rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white">
          {t.huntStart}
        </button>
        <p className="text-xs opacity-70">{t.huntHint}</p>
      </div>
    );
  }
  if (phase === "aiming" || phase === "throwing") {
    return (
      <>
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-between px-4 text-sm font-semibold" style={{ color: ink }}>
          <p>{fillTemplate(t.huntMonth, { n: String(month) })}</p>
          <p>{fillTemplate(t.huntCoins, { n: String(coins) })}</p>
        </div>
        {phase === "throwing" ? (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2">
            <button type="button" onClick={onSpeedUp} disabled={sped} className="rounded-lg bg-black/40 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              ⏩ {t.huntSpeedUp}
            </button>
            <button type="button" onClick={onCallBack} className="rounded-lg bg-black/40 px-3 py-1.5 text-xs font-semibold text-white">
              {t.huntCallBack}
            </button>
          </div>
        ) : null}
      </>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-6">
      <div className="w-full max-w-xs space-y-3 rounded-2xl bg-surface p-5 text-center text-gray-900 shadow-lg">
        <p className="text-sm text-gray-500">{t.huntScore}</p>
        <p className="text-5xl font-bold italic tracking-tight">{score}</p>
        {newBest ? <p className="font-semibold text-amber-600 dark:text-amber-400">{t.soloNewBest}</p> : <p className="text-sm">{fillTemplate(t.soloBest, { n: String(best) })}</p>}
        <div className="flex gap-2 pt-2">
          <a href="/games" aria-disabled={guard} className={`flex-1 rounded-lg border border-gray-200 py-2 text-sm ${guard ? "pointer-events-none opacity-50" : ""}`}>
            {t.soloBackToGames}
          </a>
          <button type="button" disabled={guard} onClick={onAgain} className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t.soloAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
