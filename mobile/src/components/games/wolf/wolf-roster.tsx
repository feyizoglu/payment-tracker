import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, ROLE_NAME_KEYS, playerColor, type GameState } from "@ptracker/shared/wolf-game";
import { GameButton } from "@/components/games/game-button";

// The narrator's list of every player's role, shown once after the deal on the narrator's grey.
export function WolfRoster({ state, onStart }: { state: GameState; onStart: () => void }) {
  const { t } = useLang();
  const ink = { color: GAME_THEME.ink };
  return (
    <View className="gap-4">
      <Text className="text-center text-xl font-bold" style={ink}>
        {t.wolfAllRoles}
      </Text>
      <View className="gap-2">
        {state.setup.players.map((name, seat) => (
          <View
            key={seat}
            className="flex-row items-center justify-between rounded-xl px-4 py-2.5"
            style={{ backgroundColor: playerColor(seat) }}>
            <Text className="text-base font-semibold" style={ink}>
              {name}
            </Text>
            <Text className="text-base" style={ink}>
              {t[ROLE_NAME_KEYS[state.roles[seat]]]}
            </Text>
          </View>
        ))}
      </View>
      <GameButton label={t.wolfStartNight} onPress={onStart} />
    </View>
  );
}
