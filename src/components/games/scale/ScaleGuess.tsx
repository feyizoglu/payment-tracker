"use client";

import { useLang } from "@/lib/i18n";
import type { ScalePair } from "@/lib/scale-game";
import ScaleNeedle from "./ScaleNeedle";
import { ScaleEnds } from "./ScaleTrack";

// The team moves the needle; Lock in takes a second tap.
export default function ScaleGuess({
  pair,
  team,
  color,
  needle,
  confirming,
  onMove,
  onLock,
}: {
  pair: ScalePair;
  team: string;
  color: string;
  needle: number;
  /** Lock in was tapped once: the next tap locks the needle. */
  confirming: boolean;
  onMove: (needle: number) => void;
  onLock: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-5 py-4">
      <p className="break-words text-center text-2xl font-bold" style={{ color }}>
        {team}
      </p>
      <p className="text-center text-gray-500">{t.scaleGuessHint}</p>
      <ScaleEnds pair={pair} />
      <ScaleNeedle value={needle} onMove={onMove} />
      <button
        type="button"
        onClick={onLock}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {confirming ? t.scaleConfirm : t.scaleLockIn}
      </button>
    </div>
  );
}
