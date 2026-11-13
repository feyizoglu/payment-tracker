import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useLang, type Lang } from "@ptracker/shared/i18n";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

export default function GamesScreen() {
  const { t, lang, setLang } = useLang();
  const pinReady = useEnterGameModeOnce();

  if (!pinReady) return <GamesPinSetup title={t.games} />;

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
      {/* Settings is out of reach in game mode, so the language can be changed here. */}
      <SegmentedToggle
        label={t.language}
        value={lang}
        options={[
          { value: "tr", label: "Türkçe" },
          { value: "en", label: "English" },
        ]}
        onChange={(next) => setLang(next as Lang)}
      />
    </GameScreen>
  );
}
