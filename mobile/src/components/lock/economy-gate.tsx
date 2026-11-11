import { hasPin } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { ScrollView } from "react-native";

import { TabScreen } from "@/components/tab-screen";
import { useAppLock } from "@/lib/app-lock-context";
import { PinScreen } from "./pin-screen";

// Asks for the PIN on every visit: leaving the tab locks it again.
export function EconomyGate({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  const [unlocked, setUnlocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => setUnlocked(false);
    }, [])
  );

  if (!lock.economyLock || !hasPin(lock) || unlocked) return <>{children}</>;

  return (
    <TabScreen>
      <ScrollView contentContainerClassName="p-4" keyboardShouldPersistTaps="handled">
        <PinScreen
          title={t.pinEconomyTitle}
          onUnlock={async (next) => {
            await update(next);
            setUnlocked(true);
          }}
        />
      </ScrollView>
    </TabScreen>
  );
}
