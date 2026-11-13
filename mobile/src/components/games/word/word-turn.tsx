import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  WORD_ANSWER_LOOK,
  WORD_COLORS,
  WORD_TIME_UP_MS,
  WORD_WARN_SECONDS,
  formatCountdown,
  remainingSeconds,
  type WordCard,
  type WordMode,
  type WordResult,
} from "@ptracker/shared/word-game";

// The describer's screen. Render it in a GameScreen with `scroll={false}` on the team's
// colour, mount it with `key` per turn so the clock starts fresh, and pass a stable
// `onTimeUp`, or the pause before it would restart on every render.
export function WordTurn({
  card,
  teamName,
  mode,
  endsAt,
  passLimit,
  passesLeft,
  onAnswer,
  onTimeUp,
}: {
  card: WordCard;
  teamName: string;
  mode: WordMode;
  endsAt: number;
  passLimit: number | null;
  passesLeft: number | null;
  onAnswer: (result: WordResult) => void;
  onTimeUp: () => void;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());
  // Each stage is read out once, however often the effect runs.
  const announced = useRef<"warn" | "over" | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const left = remainingSeconds(endsAt, now);
  const over = left === 0;
  const warn = left <= WORD_WARN_SECONDS;

  useEffect(() => {
    const stage = over ? "over" : warn ? "warn" : null;
    if (!stage || announced.current === stage) return;
    announced.current = stage;
    AccessibilityInfo.announceForAccessibility(
      stage === "over" ? t.wordTimeUp : t.wordSecondsLeft.replace("{n}", String(WORD_WARN_SECONDS))
    );
  }, [over, warn, t]);

  useEffect(() => {
    if (!over) return;
    const id = setTimeout(onTimeUp, WORD_TIME_UP_MS);
    return () => clearTimeout(id);
  }, [over, onTimeUp]);

  const clock = (
    <Text
      accessibilityRole="timer"
      className="text-5xl font-bold"
      style={{ color: warn ? WORD_COLORS.warn : GAME_THEME.text, fontVariant: ["tabular-nums"] }}>
      {formatCountdown(left)}
    </Text>
  );

  const answerButton = (result: WordResult, label: string, disabled: boolean, accessibilityLabel = label) => (
    <Pressable
      key={result}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onAnswer(result)}
      className={`flex-1 items-center rounded-xl border-2 py-5 ${disabled ? "opacity-40" : ""}`}
      style={{ backgroundColor: WORD_ANSWER_LOOK[result].fill, borderColor: GAME_THEME.bg }}>
      <Text className="text-lg font-bold" style={{ color: WORD_ANSWER_LOOK[result].text }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View className="flex-1 justify-between gap-4 py-2">
      <View className="items-center gap-2">
        <Text className="text-base font-semibold" style={{ color: GAME_THEME.ink }}>
          {teamName}
        </Text>
        <View className="rounded-full px-6 py-1" style={{ backgroundColor: GAME_THEME.bg }}>
          {warn && !over ? (
            <Animated.View key={left} entering={ZoomIn.duration(200)}>
              {clock}
            </Animated.View>
          ) : (
            clock
          )}
        </View>
      </View>
      <View
        className="min-h-64 flex-1 items-center justify-center gap-4 rounded-3xl p-6"
        style={{ backgroundColor: GAME_THEME.bg }}>
        {over ? (
          <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
            {t.wordTimeUp}
          </Text>
        ) : (
          <>
            <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
              {card.word}
            </Text>
            {mode === "forbidden" ? (
              <View className="items-center gap-1">
                <Text className="text-xs uppercase" style={{ color: GAME_THEME.muted }}>
                  {t.wordForbiddenLabel}
                </Text>
                {card.forbidden.map((word) => (
                  <Text key={word} className="text-xl font-semibold" style={{ color: WORD_COLORS.warn }}>
                    {word}
                  </Text>
                ))}
              </View>
            ) : (
              <Text className="text-center text-base" style={{ color: GAME_THEME.muted }}>
                {mode === "mime" ? t.wordNoTalking : t.wordFreeHint}
              </Text>
            )}
          </>
        )}
      </View>
      <View className="flex-row gap-2">
        {answerButton("foul", t.wordFoul, over)}
        {passLimit === 0
          ? null
          : answerButton(
              "pass",
              passesLeft === null ? t.wordPass : `${t.wordPass} (${passesLeft})`,
              over || passesLeft === 0,
              passesLeft === null ? t.wordPass : t.wordPassesLeft.replace("{n}", String(passesLeft))
            )}
        {answerButton("correct", t.wordCorrect, over)}
      </View>
    </View>
  );
}
