"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Loader2, LogOut } from "lucide-react";
import EventsHeader from "@/components/events/EventsHeader";
import PinSetup from "@/components/lock/PinSetup";
import { useLang } from "@/lib/i18n";
import { prepareGamesOffline } from "@/lib/games-offline";
import { gamesAccess, isRememberedSignedIn, rememberSignedIn } from "@/lib/games-auth";
import { enterGameMode, hasPin, setPin } from "@/lib/app-lock";
import { randomSalt, sha256Hex, useAppLock, writeLock } from "@/lib/app-lock-store";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const noSubscribe = () => () => {};

// Plain <a> for the back link on purpose: offline, a full page load is answered by the
// service worker, a client-side navigation is not.
export default function GamesShell({ title, backHref, children }: { title?: string; backHref?: string; children: ReactNode }) {
  const { t } = useLang();
  const router = useRouter();
  const { status } = useSession();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const remembered = useSyncExternalStore(noSubscribe, isRememberedSignedIn, () => false);
  const access = gamesAccess(status, online, remembered);
  const lock = useAppLock();
  const pinReady = lock !== null && hasPin(lock);

  useEffect(() => {
    if (access === "allow" && lock && hasPin(lock) && !lock.gameMode) writeLock(enterGameMode(lock));
  }, [access, lock]);

  useEffect(() => {
    if (status === "authenticated") rememberSignedIn(true);
    else if (status === "unauthenticated" && online) rememberSignedIn(false);
  }, [status, online]);

  useEffect(() => {
    if (access === "signin") router.replace("/");
  }, [access, router]);

  useEffect(() => {
    if (status === "authenticated") void prepareGamesOffline();
  }, [status]);

  return (
    <div className="min-h-screen bg-gray-50">
      <EventsHeader active="games" />
      {access !== "allow" ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <main className="max-w-2xl mx-auto px-4 py-6">
          {lock === null ? null : !pinReady ? (
            <div className="mx-auto max-w-sm space-y-4 py-6">
              <div className="space-y-1 text-center">
                <h1 className="text-xl font-bold text-gray-900">{t.pinSetTitle}</h1>
                <p className="text-sm text-gray-500">{t.pinSetDesc}</p>
              </div>
              <PinSetup onDone={async (pin) => writeLock(enterGameMode(await setPin(lock, pin, randomSalt(), sha256Hex)))} />
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                {title && backHref && (
                  <a href={backHref} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" aria-label={t.back}>
                    <ArrowLeft className="w-5 h-5" />
                  </a>
                )}
                {title && <h1 className="flex-1 font-bold text-gray-900">{title}</h1>}
                <a
                  href="/dashboard"
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  <LogOut className="w-4 h-4" />
                  {t.gameModeExit}
                </a>
              </div>
              {children}
            </>
          )}
        </main>
      )}
    </div>
  );
}
