import { useEffect, useState } from "react";
import { Animated, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate, fuseStage } from "@ptracker/shared/hot-potato";

const TICK_MS = 200;
/** Half a pulse, in ms: the glow comes up, then goes down again. */
const PULSE_HALF_MS = { pulse: 500, fast: 250 } as const;

// The holder's screen. Render it in a GameScreen with `scroll={false}` on the holder's colour.
// It only asks the game to check the fuse; the game decides when it goes off. Pass stable
// callbacks, or the timer and the listener restart on every render.
export function PotatoPlay({
  holder,
  task,
  fuseMs,
  burntMs,
  litAt,
  onPass,
  onTick,
  onPause,
  onResume,
}: {
  holder: string;
  task: string;
  fuseMs: number;
  burntMs: number;
  litAt: number | null;
  onPass: () => void;
  onTick: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  const [glow] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [onTick]);

  // Nobody explodes while the app is in the background or the phone is locked.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => (next === "active" ? onResume() : onPause()));
    return () => sub.remove();
  }, [onPause, onResume]);

  const stage = fuseStage({ fuseMs, burntMs, litAt }, now);

  useEffect(() => {
    if (stage === "calm") return;
    const half = PULSE_HALF_MS[stage];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: half, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: half, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      glow.setValue(0);
    };
  }, [stage, glow]);

  return (
    <View className="flex-1 justify-between gap-4 py-2">
      {stage === "calm" ? null : (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              pointerEvents: "none",
              borderRadius: 24,
              backgroundColor: "#FFFFFF",
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }),
            },
          ]}
        />
      )}
      <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
        {holder}
      </Text>
      <View
        className="min-h-56 flex-1 items-center justify-center rounded-3xl p-6"
        style={{ backgroundColor: GAME_THEME.bg }}>
        <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
          {task}
        </Text>
      </View>
      <Text className="text-center text-sm" style={{ color: GAME_THEME.ink, opacity: 0.8 }}>
        {t.potatoSayDifferent}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fillTemplate(t.potatoPassLabel, { name: holder })}
        onPress={onPass}
        className="items-center rounded-3xl py-10"
        style={{ backgroundColor: GAME_THEME.bg }}>
        <Text className="text-4xl font-black" style={{ color: GAME_THEME.text }}>
          {t.potatoPass}
        </Text>
      </Pressable>
    </View>
  );
}
