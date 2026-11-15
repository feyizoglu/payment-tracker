import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate, scaleWinner, teamColor, type WordTeam } from "@ptracker/shared/scale-game";
import { WordScores } from "@/components/games/word/word-scores";
import { PrimaryButton } from "@/components/ui/primary-button";

export function ScaleEnd({
  teams,
  scores,
  onPlayAgain,
  onNewGame,
}: {
  teams: readonly WordTeam[];
  scores: readonly [number, number];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const winner = scaleWinner(scores);

  return (
    <View className="gap-6 py-6">
      {winner === null ? (
        <Text className="text-center text-4xl font-bold text-gray-900">{t.scaleTie}</Text>
      ) : (
        <View className="rounded-2xl px-4 py-6" style={{ backgroundColor: teamColor(winner) }}>
          <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.ink }}>
            {fillTemplate(t.scaleWins, { team: teams[winner].name })}
          </Text>
        </View>
      )}
      <WordScores teams={teams} scores={scores} />
      <PrimaryButton label={t.scalePlayAgain} onPress={onPlayAgain} />
      <Pressable accessibilityRole="button" onPress={onNewGame} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.scaleNewGame}</Text>
      </Pressable>
    </View>
  );
}
