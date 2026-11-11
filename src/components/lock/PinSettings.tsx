"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { clearPin, hasPin, setEconomyLock, setPin, type AppLockState } from "@/lib/app-lock";
import { randomSalt, sha256Hex, useAppLock, writeLock } from "@/lib/app-lock-store";
import PinScreen from "./PinScreen";
import PinSetup from "./PinSetup";

// Set the PIN, or, after the current PIN, change it, remove it or toggle the Economy lock.
export default function PinSettings({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const lock = useAppLock();
  const [verified, setVerified] = useState(false);
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!lock) return null;

  async function save(current: AppLockState, pin: string) {
    writeLock(await setPin(current, pin, randomSalt(), sha256Hex));
    setChanging(false);
    setVerified(true);
    setNotice(t.pinSaved);
  }

  if (!hasPin(lock)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">{t.pinNotSet}</p>
        <PinSetup onDone={(pin) => save(lock, pin)} />
      </div>
    );
  }

  if (!verified) {
    return (
      <PinScreen
        state={lock}
        title={t.pinCurrent}
        showForgot={false}
        onUnlock={(next) => {
          writeLock(next);
          setVerified(true);
        }}
      />
    );
  }

  if (changing) return <PinSetup onDone={(pin) => save(lock, pin)} />;

  return (
    <div className="space-y-4">
      {notice && <p className="text-sm text-green-700">{notice}</p>}
      <label className="flex items-center justify-between gap-3">
        <span className="text-gray-900">{t.pinEconomyLock}</span>
        <input
          type="checkbox"
          checked={lock.economyLock}
          onChange={(e) => writeLock(setEconomyLock(lock, e.target.checked))}
          className="h-5 w-5 shrink-0"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setChanging(true)}
          className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          {t.pinChange}
        </button>
        <button
          type="button"
          onClick={() => {
            writeLock(clearPin());
            onClose();
          }}
          className="flex-1 rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          {t.pinRemove}
        </button>
      </div>
    </div>
  );
}
