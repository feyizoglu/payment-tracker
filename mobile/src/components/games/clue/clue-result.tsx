import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CLUE_OUTCOME_KEYS,
  CLUE_OUTCOME_LOOK,
  CLUE_STRIKE_KEYS,
  clueStrikeReason,
  fillTemplate,
  type ClueRoundResult,
} from "@ptracker/shared/clue-game";
import { PrimaryButton } from "@/components/ui/primary-button";

// The round is over: the word, the result and every clue are shown to the whole table.
export function ClueResult({
  result,
  round,
  total,
  score,
  onNext,
}: {
  result: ClueRoundResult;
  /** 1-based. */
  round: number;
  total: number;
  score: number;
  onNext: () => void;
}) {
  const { t } = useLang();
  const look = CLUE_OUTCOME_LOOK[result.outcome];

  return (
    <View className="gap-5 py-2">
      <Text className="text-center text-sm font-semibold text-gray-500">
        {fillTemplate(t.clueRound, { n: String(round), total: String(total) })} ·{" "}
        {fillTemplate(t.clueScoreSoFar, { n: String(score) })}
      </Text>
      <View className="gap-1">
        <Text className="text-center text-sm text-gray-500">{t.clueWordWas}</Text>
        <Text className="text-center text-4xl font-black text-gray-900">{result.word.word}</Text>
      </View>
      <Text className="text-center text-2xl font-bold" style={{ color: look.color }}>
        {`${look.mark} ${t[CLUE_OUTCOME_KEYS[result.outcome]]}`}
      </Text>
      <Text className="text-center text-sm font-medium text-gray-500">{t.clueClues}</Text>
      <View className="gap-2">
        {result.clues.map((c, i) => {
          const why = clueStrikeReason(c);
          return (
            <View
              key={i}
              className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface px-4 py-3">
              <View className="flex-1">
                <Text
                  className={`font-semibold ${why === null ? "text-gray-900" : "text-gray-400"}`}
                  style={why === null ? undefined : { textDecorationLine: "line-through" }}>
                  {c.text}
                </Text>
                {why !== null ? <Text className="text-xs text-gray-500">{t[CLUE_STRIKE_KEYS[why]]}</Text> : null}
              </View>
              <Text className="text-sm text-gray-500">{c.giver}</Text>
            </View>
          );
        })}
      </View>
      <PrimaryButton label={t.clueNext} onPress={onNext} />
    </View>
  );
}
