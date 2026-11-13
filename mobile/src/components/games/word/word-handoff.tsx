import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, type WordTeam } from "@ptracker/shared/word-game";
import { GameButton } from "@/components/games/game-button";
import { WordScores } from "@/components/games/word/word-scores";

// Hands the phone to the next describer. It sits on that team's colour.
export function WordHandoff({
  describer,
  teamName,
  teams,
  scores,
  onBegin,
  onEnd,
}: {
  describer: string;
  teamName: string;
  teams: readonly WordTeam[];
  scores: readonly number[];
  onBegin: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  return (
    <View className="gap-6 py-6">
      <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
        {t.wordGiveTo.replace("{name}", () => describer).replace("{team}", () => teamName)}
      </Text>
      <Text className="text-center text-sm" style={{ color: GAME_THEME.ink, opacity: 0.8 }}>
        {t.wordHandoffHint}
      </Text>
      <WordScores teams={teams} scores={scores} />
      <GameButton label={t.wordBegin} onPress={onBegin} />
      <Pressable accessibilityRole="button" onPress={onEnd} className="py-2">
        <Text className="text-center text-sm font-semibold underline" style={{ color: GAME_THEME.ink }}>
          {t.wordEndGame}
        </Text>
      </Pressable>
    </View>
  );
}
