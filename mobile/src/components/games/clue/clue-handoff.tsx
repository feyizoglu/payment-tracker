import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate } from "@ptracker/shared/clue-game";
import { GameButton } from "@/components/games/game-button";

// Seen by the whole table, the guesser too: render it on the guesser's colour, never with the word.
export function ClueHandoff({
  guesser,
  next,
  round,
  total,
  score,
  onBegin,
}: {
  guesser: string;
  /** The first clue giver, who takes the phone. */
  next: string;
  /** 1-based. */
  round: number;
  total: number;
  score: number;
  onBegin: () => void;
}) {
  const { t } = useLang();
  const ink = { color: GAME_THEME.ink };

  return (
    <View className="flex-1 justify-center gap-6 py-6">
      <Text className="text-center text-sm font-semibold" style={[ink, { opacity: 0.8 }]}>
        {fillTemplate(t.clueRound, { n: String(round), total: String(total) })} ·{" "}
        {fillTemplate(t.clueScoreSoFar, { n: String(score) })}
      </Text>
      <Text className="text-center text-3xl font-bold" style={ink}>
        {fillTemplate(t.clueGuesses, { name: guesser })}
      </Text>
      <Text className="text-center text-lg font-semibold" style={ink}>
        {fillTemplate(t.clueDontLook, { name: guesser, next })}
      </Text>
      <GameButton label={t.clueBegin} onPress={onBegin} />
    </View>
  );
}
