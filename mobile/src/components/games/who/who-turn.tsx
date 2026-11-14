import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  WHO_ANSWER_COLORS,
  formatCountdown,
  nameSize,
  whoTimeLeft,
  type NameSize,
  type WhoPlayCard,
  type WhoResult,
} from "@ptracker/shared/who-game";

const TICK_MS = 200;
const NAME_FONT = { xl: 64, lg: 52, md: 42, sm: 34 } as const satisfies Record<NameSize, number>;

// Render it in a GameScreen with `scroll={false}`. The guesser holds the phone to their
// forehead, so the table reads the card and the guesser taps blind: Got it fills the top half
// and Pass the bottom one (top and bottom do not swap for someone facing the other way). The
// card lets touches through to the half under it. It only asks the game to check the clock;
// pass stable callbacks, or the timer and the listener restart on every render.
export function WhoTurn({
  card,
  turnMs,
  usedMs,
  runningSince,
  onAnswer,
  onTick,
  onPause,
  onResume,
}: {
  card: WhoPlayCard;
  turnMs: number;
  usedMs: number;
  runningSince: number | null;
  onAnswer: (result: WhoResult) => void;
  onTick: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { t } = useLang();
  const focused = useIsFocused();
  const [now, setNow] = useState(() => Date.now());
  // The screen only mounts after a tap, so a state not reported yet counts as active.
  const [appActive, setAppActive] = useState(
    () => AppState.currentState !== "background" && AppState.currentState !== "inactive"
  );

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [onTick]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setAppActive(next === "active"));
    return () => sub.remove();
  }, []);

  // The time stops while the app is in the background, the phone is locked or the game-mode
  // PIN screen covers the game, which stays mounted under it.
  useEffect(() => {
    if (focused && appActive) onResume();
    else onPause();
  }, [focused, appActive, onPause, onResume]);

  const left = formatCountdown(Math.ceil(whoTimeLeft({ turnMs, usedMs, runningSince }, now) / 1000));
  const font = NAME_FONT[nameSize(card.name)];
  const half = (result: WhoResult, label: string, justify: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onAnswer(result)}
      className={`flex-1 items-center rounded-3xl p-5 ${justify}`}
      style={{ backgroundColor: WHO_ANSWER_COLORS[result] }}>
      <Text className="text-3xl font-black" style={{ color: GAME_THEME.ink }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View className="flex-1 gap-3">
      {half("got", t.whoGotIt, "justify-start")}
      {half("pass", t.whoPass, "justify-end")}
      <View style={[StyleSheet.absoluteFill, { justifyContent: "center", paddingHorizontal: 8, pointerEvents: "none" }]}>
        <View className="items-center gap-3 rounded-3xl px-4 py-6" style={{ backgroundColor: GAME_THEME.bg }}>
          <Text
            accessibilityRole="timer"
            accessibilityLabel={`${t.whoTimeLeft} ${left}`}
            className="text-2xl font-bold"
            style={{ color: GAME_THEME.muted, fontVariant: ["tabular-nums"] }}>
            {left}
          </Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={3}
            className="text-center font-black"
            style={{ color: GAME_THEME.text, fontSize: font, lineHeight: Math.round(font * 1.15) }}>
            {card.name}
          </Text>
          <Text className="text-center text-xl" style={{ color: GAME_THEME.muted }}>
            {card.hint}
          </Text>
        </View>
      </View>
    </View>
  );
}
