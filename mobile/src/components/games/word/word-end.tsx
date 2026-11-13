import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, teamColor, winner, type WordTeam } from "@ptracker/shared/word-game";
import { WordScores } from "@/components/games/word/word-scores";
import { PrimaryButton } from "@/components/ui/primary-button";

export function WordEnd({
  teams,
  scores,
  outOfWords,
  onPlayAgain,
  onNewGame,
}: {
  teams: readonly WordTeam[];
  scores: readonly [number, number];
  outOfWords: boolean;
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const win = winner(scores);
  return (
    <View className="gap-6 py-6">
      {outOfWords ? <Text className="text-center text-sm text-gray-500">{t.wordNoWordsLeft}</Text> : null}
      <Text
        className="text-center text-3xl font-bold"
        style={{ color: win === null ? GAME_THEME.text : teamColor(win) }}>
        {win === null ? t.wordDraw : t.wordWins.replace("{team}", () => teams[win].name)}
      </Text>
      <WordScores teams={teams} scores={scores} />
      <PrimaryButton label={t.wordPlayAgain} onPress={onPlayAgain} />
      <Pressable accessibilityRole="button" onPress={onNewGame} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.wordNewGame}</Text>
      </Pressable>
    </View>
  );
}
