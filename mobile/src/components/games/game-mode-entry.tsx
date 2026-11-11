import { enterGameMode, hasPin, setPin } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useEffect, useRef } from "react";
import { Text } from "react-native";

import { GameScreen } from "@/components/games/game-screen";
import { PinSetup } from "@/components/lock/pin-setup";
import { useAppLock } from "@/lib/app-lock-context";
import { randomSalt, sha256Hex } from "@/lib/app-lock-storage";

// Once per visit: the games stay mounted under the exit screen, and re-entering on every
// lock change would undo leaving game mode. Returns whether a PIN exists.
export function useEnterGameModeOnce(): boolean {
  const { lock, update } = useAppLock();
  const enteredRef = useRef(false);
  useEffect(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    if (hasPin(lock) && !lock.gameMode) void update(enterGameMode(lock));
  }, [lock, update]);
  return hasPin(lock);
}

export function GamesPinSetup({ title }: { title: string }) {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  return (
    <GameScreen title={title}>
      <Text className="text-center text-xl font-bold text-gray-900">{t.pinSetTitle}</Text>
      <Text className="text-center text-sm text-gray-500">{t.pinSetDesc}</Text>
      <PinSetup onDone={async (pin) => update(enterGameMode(await setPin(lock, pin, randomSalt(), sha256Hex)))} />
    </GameScreen>
  );
}
