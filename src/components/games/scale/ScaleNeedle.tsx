"use client";

import type { PointerEvent } from "react";
import { useLang } from "@/lib/i18n";
import { SCALE_MAX, SCALE_MIN, fillTemplate, needleAt } from "@/lib/scale-game";
import { ScaleBar } from "./ScaleTrack";

// The line as a slider: press it to put the needle there, drag to follow, use the arrow keys,
// or nudge by one with ◀ ▶.
export default function ScaleNeedle({ value, onMove }: { value: number; onMove: (needle: number) => void }) {
  const { t } = useLang();
  const at = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return needleAt(e.clientX - box.left, box.width);
  };
  const keys: Record<string, number> = {
    ArrowLeft: value - 1,
    ArrowDown: value - 1,
    ArrowRight: value + 1,
    ArrowUp: value + 1,
    PageDown: value - 10,
    PageUp: value + 10,
    Home: SCALE_MIN,
    End: SCALE_MAX,
  };
  const nudge = "rounded-xl border border-gray-200 px-6 py-3 text-xl text-gray-900 hover:bg-gray-100 disabled:opacity-40";

  return (
    <div className="space-y-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t.scaleNeedle}
        aria-valuemin={SCALE_MIN}
        aria-valuemax={SCALE_MAX}
        aria-valuenow={value}
        aria-valuetext={fillTemplate(t.scaleNeedleValue, { n: String(value) })}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          onMove(at(e));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) onMove(at(e));
        }}
        onKeyDown={(e) => {
          if (!Object.prototype.hasOwnProperty.call(keys, e.key)) return;
          e.preventDefault();
          onMove(keys[e.key]);
        }}
        className="cursor-pointer touch-none select-none rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <ScaleBar needle={value} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={t.scaleNudgeLeft}
          disabled={value <= SCALE_MIN}
          onClick={() => onMove(value - 1)}
          className={nudge}
        >
          ◀
        </button>
        <span aria-hidden="true" className="text-2xl font-bold text-gray-900">
          {value}
        </span>
        <button
          type="button"
          aria-label={t.scaleNudgeRight}
          disabled={value >= SCALE_MAX}
          onClick={() => onMove(value + 1)}
          className={nudge}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
