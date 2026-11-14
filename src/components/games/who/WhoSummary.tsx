"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  GAME_THEME,
  WHO_ANSWER_COLORS,
  WHO_RESULT_KEYS,
  WHO_RESULT_MARKS,
  WHO_SUMMARY_LOCK_MS,
  WHO_VIBRATE_MS,
  fillTemplate,
  turnPoints,
  type WhoTurnCard,
} from "@/lib/who-game";
import WhoScores from "./WhoScores";

// The turn screen is gone once the time is up, so this screen tells the guesser: it vibrates
// and is read out once when it appears. Mount it with `key` per turn.
export default function WhoSummary({
  side,
  endedAt,
  results,
  names,
  colors,
  scores,
  onFlip,
  onNext,
}: {
  /** The player or team whose turn it was. */
  side: number;
  /** When the turn ended: the cards and Next open WHO_SUMMARY_LOCK_MS later, as in the game. */
  endedAt: number;
  results: readonly WhoTurnCard[];
  names: readonly string[];
  colors: readonly string[];
  /** Including this turn's points. */
  scores: readonly number[];
  onFlip: (index: number) => void;
  onNext: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(WHO_VIBRATE_MS);
    } catch {
      // Vibration is a bonus: a browser that refuses it changes nothing.
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setOpen(true), Math.max(0, endedAt + WHO_SUMMARY_LOCK_MS - Date.now()));
    return () => clearTimeout(id);
  }, [endedAt]);

  return (
    <div className="space-y-5 text-center">
      <p role="alert" aria-live="assertive" className="text-3xl font-bold">
        {t.whoTimeUp}
      </p>
      <p className="break-words font-semibold" style={{ color: colors[side] }}>
        {fillTemplate(t.whoTurnPoints, { name: names[side], n: String(turnPoints(results)) })}
      </p>
      <p className="text-sm text-gray-500">{t.whoFlipHint}</p>
      <ul className="space-y-2 text-left">
        {results.map((r, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={!open}
              onClick={() => onFlip(i)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3 hover:bg-gray-100 disabled:opacity-60"
            >
              <span className="min-w-0 break-words text-gray-900">{r.card.name}</span>
              <span
                className="shrink-0 text-sm font-semibold"
                style={{ color: r.result === "got" ? WHO_ANSWER_COLORS.got : GAME_THEME.muted }}
              >
                {WHO_RESULT_MARKS[r.result]} {t[WHO_RESULT_KEYS[r.result]]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <WhoScores names={names} colors={colors} scores={scores} />
      <button
        type="button"
        disabled={!open}
        onClick={onNext}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {t.whoNext}
      </button>
    </div>
  );
}
