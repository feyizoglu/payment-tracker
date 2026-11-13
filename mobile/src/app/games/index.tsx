import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";

export default function GamesScreen() {
  const { t, lang, setLang } = useLang();
  const pinReady = useEnterGameModeOnce();

  if (!pinReady) return <GamesPinSetup title={t.games} />;

  return (
    <GameScreen
      title={t.games}
      right={
        // Settings is out of reach in game mode, so the language is changed here.
        <Pressable
          onPress={() => setLang(lang === "tr" ? "en" : "tr")}
          accessibilityRole="button"
          accessibilityLabel={t.language}
          hitSlop={8}
          className="w-14 items-end">
          <Text className="text-2xl">{lang === "tr" ? "🇹🇷" : "🇬🇧"}</Text>
        </Pressable>
      }>
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
      <Pressable
        onPress={() => router.push("/games/wolf")}
        className="flex-row items-center gap-4 rounded-xl border border-gray-100 p-4">
        <View className="rounded-lg bg-purple-50 p-3">
          <Text className="text-2xl">🐺</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{t.wolfTitle}</Text>
          <Text className="text-sm text-gray-500">{t.wolfDesc}</Text>
        </View>
        <Text className="text-xl text-gray-400">›</Text>
      </Pressable>
    </GameScreen>
  );
}
