import { GAME_THEME, scaleZoneColor, scaleZones, type ScalePair } from "@/lib/scale-game";

/** Zones narrower than this, in % of the line, are drawn without their points. */
const MIN_LABELLED = 3;

/** The pair's two ends, over the line. */
export function ScaleEnds({ pair }: { pair: ScalePair }) {
  return (
    <div className="flex justify-between gap-3 text-lg font-bold text-gray-900">
      <p className="min-w-0 break-words text-left">{`← ${pair.left}`}</p>
      <p className="min-w-0 break-words text-right">{`${pair.right} →`}</p>
    </div>
  );
}

// The 0–100 line: the scoring band around `target` with each zone's points written on it, and
// the needle. It never takes a pointer, so the slider around it reads positions along the line.
export function ScaleBar({ target, needle, label }: { target?: number; needle?: number; label?: string }) {
  return (
    <div
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      className="pointer-events-none relative h-16 overflow-hidden rounded-xl border border-gray-200 bg-gray-100"
    >
      {target !== undefined &&
        scaleZones(target).map((zone) => {
          const width = zone.to - zone.from;
          return (
            <div
              key={zone.from}
              data-zone={zone.points}
              className="absolute inset-y-0 flex items-center justify-center text-xs font-bold"
              style={{
                left: `${zone.from}%`,
                width: `${width}%`,
                backgroundColor: scaleZoneColor(zone.points),
                color: GAME_THEME.ink,
              }}
            >
              {width >= MIN_LABELLED ? String(zone.points) : ""}
            </div>
          );
        })}
      {needle !== undefined && (
        <div
          data-needle=""
          className="absolute inset-y-0 w-1.5 -translate-x-1/2 border"
          style={{ left: `${needle}%`, backgroundColor: GAME_THEME.text, borderColor: GAME_THEME.bg }}
        />
      )}
    </div>
  );
}
