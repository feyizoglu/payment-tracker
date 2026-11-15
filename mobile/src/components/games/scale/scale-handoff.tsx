import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate, type WordTeam } from "@ptracker/shared/scale-game";
import { GameButton } from "@/components/games/game-button";
import { WordScores } from "@/components/games/word/word-scores";

// Hands the phone to the clue giver. Render in a GameScreen on the team's colour.
export function ScaleHandoff({
  team,
  giver,
  turn,
  turns,
  teams,
  scores,
  onShow,
}: {
  team: string;
  giver: string;
  /** The team's turn, 1-based. */
  turn: number;
  /** Turns per team. */
  turns: number;
  teams: readonly WordTeam[];
  scores: readonly number[];
  onShow: () => void;
}) {
  const { t } = useLang();
  const ink = { color: GAME_THEME.ink };

  return (
    <View className="flex-1 justify-center gap-6 py-6">
      <Text className="text-center text-sm font-semibold" style={[ink, { opacity: 0.8 }]}>
        {fillTemplate(t.scaleTurnOf, { n: String(turn), total: String(turns) })}
      </Text>
      <Text className="text-center text-3xl font-bold" style={ink}>
        {fillTemplate(t.scaleGives, { team, name: giver })}
      </Text>
      <Text className="text-center text-base" style={[ink, { opacity: 0.8 }]}>
        {fillTemplate(t.scaleOnlyLooks, { name: giver })}
      </Text>
      <WordScores teams={teams} scores={scores} />
      <GameButton label={t.scaleShowTarget} onPress={onShow} />
    </View>
  );
}
