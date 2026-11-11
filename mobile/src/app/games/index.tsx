import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GameScreen } from "@/components/games/game-screen";

export default function GamesScreen() {
  const { t } = useLang();
  return (
    <GameScreen title={t.games}>
      <Pressable
        onPress={() => router.push("/games/imposter")}
        className="flex-row items-center gap-4 rounded-xl border border-gray-100 p-4">
        <View className="rounded-lg bg-purple-50 p-3">
          <Text className="text-2xl">🕵️</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{t.imposterTitle}</Text>
          <Text className="text-sm text-gray-500">{t.imposterDesc}</Text>
        </View>
        <Text className="text-xl text-gray-400">›</Text>
      </Pressable>
    </GameScreen>
  );
}
