import { exitGameMode } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";

import { GameScreen } from "@/components/games/game-screen";
import { PinScreen } from "@/components/lock/pin-screen";
import { useAppLock } from "@/lib/app-lock-context";

export default function AppLockScreen() {
  const { t } = useLang();
  const { update } = useAppLock();
  return (
    <GameScreen title={t.gameModeExit}>
      <PinScreen
        title={t.pinGameModeTitle}
        description={t.pinGameModeDesc}
        onUnlock={(next) => update(exitGameMode(next))}
      />
    </GameScreen>
  );
}
