import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, Text, Vibration, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  WHO_ANSWER_COLORS,
  WHO_RESULT_KEYS,
  WHO_RESULT_MARKS,
  WHO_SUMMARY_LOCK_MS,
  WHO_VIBRATE_MS,
  fillTemplate,
  turnPoints,
  type WhoTurnCard,
} from "@ptracker/shared/who-game";
import { WhoScores } from "@/components/games/who/who-scores";
import { PrimaryButton } from "@/components/ui/primary-button";

// The turn screen is gone once the time is up, so this screen tells the guesser: it vibrates
// and is read out once when it appears. Mount it with `key` per turn.
export function WhoSummary({
  side,
  endedAt,
  results,
  names,
  colors,
  scores,
  onFlip,
  onNext,
}: {
  /** The player or team whose turn it was. */
  side: number;
  /** When the turn ended: the cards and Next open WHO_SUMMARY_LOCK_MS later, as in the game. */
  endedAt: number;
  results: readonly WhoTurnCard[];
  names: readonly string[];
  colors: readonly string[];
  /** Including this turn's points. */
  scores: readonly number[];
  onFlip: (index: number) => void;
  onNext: () => void;
}) {
  const { t } = useLang();
  const timeUp = t.whoTimeUp;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    Vibration.vibrate(WHO_VIBRATE_MS);
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(timeUp);
  }, [timeUp]);

  useEffect(() => {
    const id = setTimeout(() => setOpen(true), Math.max(0, endedAt + WHO_SUMMARY_LOCK_MS - Date.now()));
    return () => clearTimeout(id);
  }, [endedAt]);

  return (
    <View className="gap-5">
      <Text className="text-center text-3xl font-bold text-gray-900">{timeUp}</Text>
      <Text className="text-center text-base font-semibold" style={{ color: colors[side] }}>
        {fillTemplate(t.whoTurnPoints, { name: names[side], n: String(turnPoints(results)) })}
      </Text>
      <Text className="text-center text-sm text-gray-500">{t.whoFlipHint}</Text>
      <View className="gap-2">
        {results.map((r, i) => {
          const label = t[WHO_RESULT_KEYS[r.result]];
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`${r.card.name}, ${label}`}
              accessibilityState={{ disabled: !open }}
              disabled={!open}
              onPress={() => onFlip(i)}
              className={`flex-row items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3 ${
                open ? "" : "opacity-60"
              }`}>
              <Text className="flex-1 text-base text-gray-900">{r.card.name}</Text>
              <Text
                className="text-sm font-semibold"
                style={{ color: r.result === "got" ? WHO_ANSWER_COLORS.got : GAME_THEME.muted }}>
                {WHO_RESULT_MARKS[r.result]} {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <WhoScores names={names} colors={colors} scores={scores} />
      <PrimaryButton label={t.whoNext} onPress={onNext} disabled={!open} />
    </View>
  );
}
