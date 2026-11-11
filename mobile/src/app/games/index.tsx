import { enterGameMode, hasPin, setPin } from "@ptracker/shared/app-lock";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GameScreen } from "@/components/games/game-screen";
import { PinSetup } from "@/components/lock/pin-setup";
import { useAppLock } from "@/lib/app-lock-context";
import { randomSalt, sha256Hex } from "@/lib/app-lock-storage";

export default function GamesScreen() {
  const { t } = useLang();
  const { lock, update } = useAppLock();

  // Once per visit: this screen stays mounted under the exit screen, and re-entering on
  // every lock change would undo leaving game mode.
  useEffect(() => {
    if (hasPin(lock) && !lock.gameMode) void update(enterGameMode(lock));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasPin(lock)) {
    return (
      <GameScreen title={t.games}>
        <Text className="text-center text-xl font-bold text-gray-900">{t.pinSetTitle}</Text>
        <Text className="text-center text-sm text-gray-500">{t.pinSetDesc}</Text>
        <PinSetup onDone={async (pin) => update(enterGameMode(await setPin(lock, pin, randomSalt(), sha256Hex)))} />
      </GameScreen>
    );
  }

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
