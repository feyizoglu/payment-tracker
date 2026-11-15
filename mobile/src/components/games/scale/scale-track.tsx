import { Text, View } from "react-native";

import { GAME_THEME, scaleZoneColor, scaleZones, type ScalePair } from "@ptracker/shared/scale-game";

/** Zones narrower than this, in % of the line, are drawn without their points. */
const MIN_LABELLED = 3;

/** The pair's two ends, over the line. */
export function ScaleEnds({ pair }: { pair: ScalePair }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="flex-1 text-left text-lg font-bold text-gray-900">{`← ${pair.left}`}</Text>
      <Text className="flex-1 text-right text-lg font-bold text-gray-900">{`${pair.right} →`}</Text>
    </View>
  );
}

// The 0–100 line: the scoring band around `target` with each zone's points written on it, and
// the needle. It never takes a touch, so the needle's drag reads positions along the line.
export function ScaleBar({ target, needle, label }: { target?: number; needle?: number; label?: string }) {
  return (
    <View
      pointerEvents="none"
      accessible={label !== undefined}
      accessibilityLabel={label}
      className="h-16 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
      {target === undefined
        ? null
        : scaleZones(target).map((zone) => {
            const width = zone.to - zone.from;
            return (
              <View
                key={zone.from}
                className="absolute bottom-0 top-0 items-center justify-center"
                style={{ left: `${zone.from}%`, width: `${width}%`, backgroundColor: scaleZoneColor(zone.points) }}>
                <Text className="text-xs font-bold" style={{ color: GAME_THEME.ink }}>
                  {width >= MIN_LABELLED ? String(zone.points) : ""}
                </Text>
              </View>
            );
          })}
      {needle === undefined ? null : (
        <View
          testID="needle"
          className="absolute bottom-0 top-0"
          style={{
            left: `${needle}%`,
            width: 6,
            marginLeft: -3,
            backgroundColor: GAME_THEME.text,
            borderColor: GAME_THEME.bg,
            borderWidth: 1,
          }}
        />
      )}
    </View>
  );
}
