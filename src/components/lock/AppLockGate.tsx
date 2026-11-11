"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { exitGameMode } from "@/lib/app-lock";
import { lockScreenFor } from "@/lib/app-lock-gate";
import { useAppLock, writeLock } from "@/lib/app-lock-store";
import PinScreen from "./PinScreen";

function Gate({ path, children }: { path: string; children: ReactNode }) {
  const { t } = useLang();
  const lock = useAppLock();
  const [economyUnlocked, setEconomyUnlocked] = useState(false);

  if (!lock) return <>{children}</>;
  const screen = lockScreenFor(path, lock, economyUnlocked);
  if (screen === "none") return <>{children}</>;

  if (screen === "game") {
    return (
      <PinScreen
        state={lock}
        title={t.pinGameModeTitle}
        description={t.pinGameModeDesc}
        cancel={{ href: "/games", label: t.pinBackToGames }}
        onUnlock={(next) => writeLock(exitGameMode(next))}
      />
    );
  }

  return (
    <PinScreen
      state={lock}
      title={t.pinEconomyTitle}
      cancel={{ href: "/dashboard", label: t.cancel }}
      onUnlock={(next) => {
        writeLock(next);
        setEconomyUnlocked(true);
      }}
    />
  );
}

// Keyed by path so an Economy unlock lasts only until the user leaves the page.
export default function AppLockGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <Gate key={path} path={path}>
      {children}
    </Gate>
  );
}
