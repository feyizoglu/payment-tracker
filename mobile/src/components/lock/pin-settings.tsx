import { clearPin, hasPin, setEconomyLock, setPin, type AppLockState } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { useAppLock } from "@/lib/app-lock-context";
import { randomSalt, sha256Hex } from "@/lib/app-lock-storage";
import { PinScreen } from "./pin-screen";
import { PinSetup } from "./pin-setup";

export function PinSettings() {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  const [verified, setVerified] = useState(false);
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(current: AppLockState, pin: string) {
    await update(await setPin(current, pin, randomSalt(), sha256Hex));
    setChanging(false);
    setVerified(true);
    setNotice(t.pinSaved);
  }

  if (!hasPin(lock)) {
    return (
      <View className="gap-3">
        <Text className="text-sm text-gray-500">{t.pinNotSet}</Text>
        <PinSetup onDone={(pin) => save(lock, pin)} />
      </View>
    );
  }

  if (!verified) {
    return (
      <PinScreen
        title={t.pinCurrent}
        showForgot={false}
        onUnlock={async (next) => {
          await update(next);
          setVerified(true);
        }}
      />
    );
  }

  if (changing) return <PinSetup onDone={(pin) => save(lock, pin)} />;

  return (
    <View className="gap-4">
      {notice ? <Text className="text-sm text-green-700">{notice}</Text> : null}
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-base text-gray-900">{t.pinEconomyLock}</Text>
        <Switch value={lock.economyLock} onValueChange={(on) => void update(setEconomyLock(lock, on))} />
      </View>
      <View className="flex-row gap-2">
        <Pressable onPress={() => setChanging(true)} className="flex-1 rounded-lg border border-gray-200 py-2.5">
          <Text className="text-center text-sm text-gray-700">{t.pinChange}</Text>
        </Pressable>
        <Pressable onPress={() => void update(clearPin())} className="flex-1 rounded-lg border border-red-200 py-2.5">
          <Text className="text-center text-sm text-red-600">{t.pinRemove}</Text>
        </Pressable>
      </View>
    </View>
  );
}
