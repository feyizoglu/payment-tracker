"use client";

import { useLang } from "@/lib/i18n";
import { fillTemplate, type ScalePair } from "@/lib/scale-game";
import { ScaleBar, ScaleEnds } from "./ScaleTrack";

// Only the clue giver looks: the pair and the target's band.
export default function ScaleSecret({ pair, target, onHide }: { pair: ScalePair; target: number; onHide: () => void }) {
  const { t } = useLang();
  return (
    <div className="space-y-5 py-4">
      <p className="text-center text-gray-500">{t.scaleSecretHint}</p>
      <ScaleEnds pair={pair} />
      <ScaleBar target={target} label={`${t.scaleTarget}, ${fillTemplate(t.scaleNeedleValue, { n: String(target) })}`} />
      <p className="text-center text-sm text-gray-500">{t.scaleBandHint}</p>
      <button
        type="button"
        onClick={onHide}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {t.scaleHide}
      </button>
    </div>
  );
}
