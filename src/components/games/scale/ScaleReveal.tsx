"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  SCALE_OUTCOME_KEYS,
  SCALE_REVEAL_LOCK_MS,
  fillTemplate,
  scaleOutcome,
  scalePoints,
  type ScalePair,
  type WordTeam,
} from "@/lib/scale-game";
import WordScores from "../word/WordScores";
import { ScaleBar, ScaleEnds } from "./ScaleTrack";

// The band and the needle together, with the points written. Mount it with `key` per turn.
export default function ScaleReveal({
  pair,
  target,
  needle,
  team,
  color,
  teams,
  scores,
  revealedAt,
  onNext,
}: {
  pair: ScalePair;
  target: number;
  needle: number;
  team: string;
  color: string;
  teams: readonly WordTeam[];
  /** Including this turn's points. */
  scores: readonly number[];
  /** When the needle was locked: Next opens SCALE_REVEAL_LOCK_MS later, as in the game. */
  revealedAt: number;
  onNext: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const distance = Math.abs(needle - target);
  const points = scalePoints(distance);

  useEffect(() => {
    const id = setTimeout(() => setOpen(true), Math.max(0, revealedAt + SCALE_REVEAL_LOCK_MS - Date.now()));
    return () => clearTimeout(id);
  }, [revealedAt]);

  return (
    <div className="space-y-5 py-4 text-center">
      <p className="text-3xl font-bold">{t[SCALE_OUTCOME_KEYS[scaleOutcome(points)]]}</p>
      <p className="break-words text-xl font-semibold" style={{ color }}>
        {fillTemplate(t.scaleTurnPoints, { team, n: String(points) })}
      </p>
      <ScaleEnds pair={pair} />
      <ScaleBar target={target} needle={needle} />
      <p className="text-sm text-gray-500">{fillTemplate(t.scaleDistance, { n: String(distance) })}</p>
      <WordScores teams={teams} scores={scores} />
      <button
        type="button"
        disabled={!open}
        onClick={onNext}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {t.scaleNext}
      </button>
    </div>
  );
}
