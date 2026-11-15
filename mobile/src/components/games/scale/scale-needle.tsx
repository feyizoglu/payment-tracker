import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { SCALE_MAX, SCALE_MIN, fillTemplate, needleAt } from "@ptracker/shared/scale-game";
import { ScaleBar } from "@/components/games/scale/scale-track";

// The line as an adjustable control: touch it to put the needle there, drag to follow, or
// nudge by one with ◀ ▶ or a screen reader's increment and decrement.
export function ScaleNeedle({ value, onMove }: { value: number; onMove: (needle: number) => void }) {
  const { t } = useLang();
  // The responder is made once, so it reads the line's width and the latest callback from here.
  const live = useRef({ width: 0, startX: 0, onMove });
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current.startX = e.nativeEvent.locationX;
        live.current.onMove(needleAt(live.current.startX, live.current.width));
      },
      // locationX is measured from whichever view is under the finger, so the drag is counted
      // from where it started instead.
      onPanResponderMove: (_e, gesture) => {
        live.current.onMove(needleAt(live.current.startX + gesture.dx, live.current.width));
      },
    })
  );

  useEffect(() => {
    live.current.onMove = onMove;
  }, [onMove]);

  const nudge = (label: string, mark: string, by: number, off: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => onMove(value + by)}
      hitSlop={8}
      className={`rounded-xl border border-gray-200 px-6 py-3 ${off ? "opacity-40" : ""}`}>
      <Text className="text-xl text-gray-900">{mark}</Text>
    </Pressable>
  );

  return (
    <View className="gap-3">
      <View
        {...responder.panHandlers}
        onLayout={(e) => {
          live.current.width = e.nativeEvent.layout.width;
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t.scaleNeedle}
        accessibilityValue={{
          min: SCALE_MIN,
          max: SCALE_MAX,
          now: value,
          text: fillTemplate(t.scaleNeedleValue, { n: String(value) }),
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment") onMove(value + 1);
          else if (e.nativeEvent.actionName === "decrement") onMove(value - 1);
        }}
        className="py-2">
        <ScaleBar needle={value} />
      </View>
      <View className="flex-row items-center justify-between gap-3">
        {nudge(t.scaleNudgeLeft, "◀", -1, value <= SCALE_MIN)}
        <Text importantForAccessibility="no" accessibilityElementsHidden className="text-2xl font-bold text-gray-900">
          {value}
        </Text>
        {nudge(t.scaleNudgeRight, "▶", 1, value >= SCALE_MAX)}
      </View>
    </View>
  );
}
