import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate } from "@ptracker/shared/who-game";

// Render in a GameScreen with `scroll={false}` on the guesser's (or their team's) colour.
// Start is large: the guesser may tap it with the phone already on their forehead.
export function WhoHandoff({
  guesser,
  team,
  round,
  rounds,
  onStart,
}: {
  guesser: string;
  /** The guesser's team, or null in a solo game. */
  team: string | null;
  round: number;
  rounds: number;
  onStart: () => void;
}) {
  const { t } = useLang();
  const ink = { color: GAME_THEME.ink };
  const title =
    team === null ? fillTemplate(t.whoGuesses, { name: guesser }) : fillTemplate(t.whoTeamGuesses, { team, name: guesser });

  return (
    <View className="flex-1 justify-center gap-6 py-6">
      <Text className="text-center text-sm font-semibold" style={[ink, { opacity: 0.8 }]}>
        {fillTemplate(t.whoRound, { n: String(round), total: String(rounds) })}
      </Text>
      <Text className="text-center text-3xl font-bold" style={ink}>
        {title}
      </Text>
      <Text className="text-center text-sm" style={[ink, { opacity: 0.8 }]}>
        {t.whoHandoffHint}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onStart}
        className="items-center rounded-3xl py-16"
        style={{ backgroundColor: GAME_THEME.bg }}>
        <Text className="text-3xl font-black" style={{ color: GAME_THEME.text }}>
          {t.whoStart}
        </Text>
      </Pressable>
    </View>
  );
}
