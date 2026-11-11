import { hasPin } from "@ptracker/shared/app-lock";
import { useLang } from "@ptracker/shared/i18n";
import { usePathname } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView } from "react-native";

import { TabScreen } from "@/components/tab-screen";
import { useAppLock } from "@/lib/app-lock-context";
import { isEconomyPath } from "@/lib/economy-path";
import { PinScreen } from "./pin-screen";

// Asks for the PIN on every visit: the unlock ends once the route is outside Economy and its own modals.
export function EconomyGate({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const { lock, update } = useAppLock();
  const onEconomy = isEconomyPath(usePathname());
  const [unlocked, setUnlocked] = useState(false);
  if (unlocked && !onEconomy) setUnlocked(false);

  if (!lock.economyLock || !hasPin(lock) || (unlocked && onEconomy)) return <>{children}</>;

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
