import { EMPTY_LOCK, type AppLockState } from "@ptracker/shared/app-lock";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { getStoredLock, setStoredLock } from "@/lib/app-lock-storage";

interface AppLockContextValue {
  ready: boolean;
  lock: AppLockState;
  update: (next: AppLockState) => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue>({
  ready: false,
  lock: EMPTY_LOCK,
  update: async () => {},
});

// Sign-out deletes the stored lock; `signedIn` turning false drops the in-memory copy too.
export function AppLockProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [lock, setLock] = useState<AppLockState>(EMPTY_LOCK);
  const [wasSignedIn, setWasSignedIn] = useState(signedIn);
  if (wasSignedIn !== signedIn) {
    setWasSignedIn(signedIn);
    if (!signedIn) setLock(EMPTY_LOCK);
  }

  useEffect(() => {
    let cancelled = false;
    getStoredLock().then((stored) => {
      if (cancelled) return;
      setLock(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (next: AppLockState) => {
    setLock(next);
    await setStoredLock(next);
  }, []);

  return <AppLockContext.Provider value={{ ready, lock, update }}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  return useContext(AppLockContext);
}
