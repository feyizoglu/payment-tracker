import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate, whoWinners } from "@ptracker/shared/who-game";
import { WhoScores } from "@/components/games/who/who-scores";
import { PrimaryButton } from "@/components/ui/primary-button";

export function WhoEnd({
  names,
  colors,
  scores,
  onPlayAgain,
  onNewGame,
}: {
  names: readonly string[];
  colors: readonly string[];
  scores: readonly number[];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const winners = whoWinners(scores);
  const winner = winners.length === 1 ? winners[0] : null;

  return (
    <View className="gap-6 py-6">
      {winner === null ? (
        <Text className="text-center text-4xl font-bold text-gray-900">{t.whoTie}</Text>
      ) : (
        <View className="rounded-2xl px-4 py-6" style={{ backgroundColor: colors[winner] }}>
          <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.ink }}>
            {fillTemplate(t.whoWins, { name: names[winner] })}
          </Text>
        </View>
      )}
      <WhoScores names={names} colors={colors} scores={scores} />
      <PrimaryButton label={t.whoPlayAgain} onPress={onPlayAgain} />
      <Pressable accessibilityRole="button" onPress={onNewGame} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.whoNewGame}</Text>
      </Pressable>
    </View>
  );
}
