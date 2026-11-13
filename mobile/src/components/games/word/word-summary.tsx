import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  WORD_RESULT_KEYS,
  WORD_RESULT_LOOK,
  fillTemplate,
  signedPoints,
  teamColor,
  turnPoints,
  type TurnResult,
  type WordTeam,
} from "@ptracker/shared/word-game";
import { WordScores } from "@/components/games/word/word-scores";
import { PrimaryButton } from "@/components/ui/primary-button";

export function WordSummary({
  team,
  teams,
  scores,
  results,
  outOfWords,
  onNext,
  onEnd,
}: {
  team: number;
  teams: readonly WordTeam[];
  scores: readonly number[];
  results: readonly TurnResult[];
  outOfWords: boolean;
  onNext: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  return (
    <View className="gap-5">
      <Text className="text-center text-3xl font-bold text-gray-900">{outOfWords ? t.wordNoWordsLeft : t.wordTimeUp}</Text>
      <Text className="text-center text-base font-semibold" style={{ color: teamColor(team) }}>
        {fillTemplate(t.wordTurnPoints, { team: teams[team].name, points: signedPoints(turnPoints(results)) })}
      </Text>
      {results.length > 0 ? (
        <View className="rounded-xl border border-gray-100">
          {results.map((r, i) => {
            const label = t[WORD_RESULT_KEYS[r.result]];
            return (
              <View
                key={i}
                accessible
                accessibilityLabel={`${r.card.word}, ${label}`}
                className={`flex-row items-center justify-between gap-3 px-4 py-2 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                <Text className="flex-1 text-base text-gray-900">{r.card.word}</Text>
                <Text className="text-sm font-semibold" style={{ color: WORD_RESULT_LOOK[r.result].color }}>
                  {WORD_RESULT_LOOK[r.result].mark} {label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <WordScores teams={teams} scores={scores} />
      <PrimaryButton label={t.wordNext} onPress={onNext} />
      <Pressable accessibilityRole="button" onPress={onEnd} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.wordEndGame}</Text>
      </Pressable>
    </View>
  );
}
