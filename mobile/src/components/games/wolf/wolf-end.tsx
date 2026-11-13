import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, ROLE_NAME_KEYS, playerColor, type GameState } from "@ptracker/shared/wolf-game";
import { PrimaryButton } from "@/components/ui/primary-button";

export function WolfEnd({
  state,
  onPlayAgain,
  onNewGame,
}: {
  state: GameState;
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const village = state.winner === "village";
  const ink = { color: GAME_THEME.ink };

  return (
    <View className="gap-5">
      <Text className={`text-center text-4xl font-bold ${village ? "text-green-600" : "text-red-600"}`}>
        {village ? t.wolfVillageWins : t.wolfWolvesWin}
      </Text>
      <View className="gap-2">
        {state.setup.players.map((name, seat) => (
          <View
            key={seat}
            className={`flex-row items-center justify-between rounded-xl px-4 py-2.5 ${state.alive[seat] ? "" : "opacity-60"}`}
            style={{ backgroundColor: playerColor(seat) }}>
            <Text
              className="text-base font-semibold"
              style={state.alive[seat] ? ink : [ink, { textDecorationLine: "line-through" }]}>
              {name}
            </Text>
            <Text className="text-base" style={ink}>
              {t[ROLE_NAME_KEYS[state.roles[seat]]]}
            </Text>
          </View>
        ))}
      </View>
      <PrimaryButton label={t.wolfPlayAgain} onPress={onPlayAgain} />
      <Pressable accessibilityRole="button" onPress={onNewGame} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.wolfNewGame}</Text>
      </Pressable>
    </View>
  );
}
