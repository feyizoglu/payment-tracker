import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CLUE_OUTCOME_KEYS,
  CLUE_OUTCOME_LOOK,
  clueRating,
  clueScore,
  fillTemplate,
  type ClueRoundResult,
} from "@ptracker/shared/clue-game";
import { PrimaryButton } from "@/components/ui/primary-button";

export function ClueEnd({
  results,
  onPlayAgain,
  onNewGame,
}: {
  results: readonly ClueRoundResult[];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const score = clueScore(results);
  const total = results.length;

  return (
    <View className="gap-6 py-6">
      <Text className="text-center text-5xl font-black text-gray-900">
        {fillTemplate(t.clueEndScore, { n: String(score), total: String(total) })}
      </Text>
      <Text className="text-center text-lg font-semibold text-gray-900">{t[clueRating(score, total)]}</Text>
      <Text className="text-center text-sm font-medium text-gray-500">{t.clueWords}</Text>
      <View className="gap-2">
        {results.map((r, i) => {
          const look = CLUE_OUTCOME_LOOK[r.outcome];
          return (
            <View
              key={i}
              className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3">
              <Text className="flex-1 text-gray-900">{r.word.word}</Text>
              <Text className="text-sm font-semibold" style={{ color: look.color }}>
                {`${look.mark} ${t[CLUE_OUTCOME_KEYS[r.outcome]]}`}
              </Text>
            </View>
          );
        })}
      </View>
      <PrimaryButton label={t.cluePlayAgain} onPress={onPlayAgain} />
      <Pressable accessibilityRole="button" onPress={onNewGame} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.clueNewGame}</Text>
      </Pressable>
    </View>
  );
}
