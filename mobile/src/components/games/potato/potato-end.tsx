import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate, playerColor } from "@ptracker/shared/hot-potato";
import { PrimaryButton } from "@/components/ui/primary-button";

export function PotatoEnd({
  players,
  winner,
  outOrder,
  onPlayAgain,
  onNewGame,
}: {
  players: string[];
  winner: number;
  /** Seats in the order they went out. */
  outOrder: number[];
  onPlayAgain: () => void;
  onNewGame: () => void;
}) {
  const { t } = useLang();
  const ink = { color: GAME_THEME.ink };

  return (
    <View className="gap-5">
      <View className="rounded-2xl px-4 py-6" style={{ backgroundColor: playerColor(winner) }}>
        <Text className="text-center text-4xl font-bold" style={ink}>
          {fillTemplate(t.potatoWins, { name: players[winner] })}
        </Text>
      </View>
      <View className="gap-2">
        <Text className="text-sm font-medium text-gray-500">{t.potatoOutOrder}</Text>
        {outOrder.map((seat, i) => (
          <View key={seat} className="rounded-xl px-4 py-2.5" style={{ backgroundColor: playerColor(seat) }}>
            <Text className="text-base font-semibold" style={ink}>
              {i + 1}. {players[seat]}
            </Text>
          </View>
        ))}
      </View>
      <PrimaryButton label={t.potatoPlayAgain} onPress={onPlayAgain} />
      <Pressable accessibilityRole="button" onPress={onNewGame} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.potatoNewGame}</Text>
      </Pressable>
    </View>
  );
}
