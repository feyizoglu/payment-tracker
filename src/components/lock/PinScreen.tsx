"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { checkPin, lockoutRemaining, type AppLockState } from "@/lib/app-lock";
import { sha256Hex, writeLock } from "@/lib/app-lock-store";
import { signOutWithPushCleanup } from "@/lib/web-push-client";

// Checks the PIN against the stored lock and saves the attempt count. `onUnlock` receives
// the updated state so the caller can apply its own change (exit game mode, …) on top.
export default function PinScreen({
  state,
  title,
  description,
  onUnlock,
  showForgot = true,
  cancel,
}: {
  state: AppLockState;
  title: string;
  description?: string;
  onUnlock: (state: AppLockState) => void;
  showForgot?: boolean;
  cancel?: { href: string; label: string };
}) {
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.ceil(lockoutRemaining(state, now) / 1000);

  useEffect(() => {
    if (state.lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.lockedUntil]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const at = Date.now();
    setNow(at);
    const result = await checkPin(state, pin, at, sha256Hex);
    setPin("");
    if (result.ok) {
      setError(null);
      onUnlock(result.state);
      return;
    }
    writeLock(result.state);
    setError(t.pinWrong);
  }

  function forgot() {
    setSignOutFailed(false);
    signOutWithPushCleanup().catch(() => setSignOutFailed(true));
  }

  return (
    <div className="mx-auto max-w-sm space-y-5 px-4 py-16 text-center">
      <Lock className="mx-auto w-8 h-8 text-gray-400" />
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {description && <p className="text-sm text-gray-500">{description}</p>}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          aria-label={t.pinEnter}
          placeholder={t.pinEnter}
          value={pin}
          disabled={wait > 0}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-center text-lg tracking-widest text-gray-900 disabled:opacity-50"
        />
        {wait > 0 ? (
          <p className="text-sm text-amber-700">{t.pinLockedOut.replace("{s}", String(wait))}</p>
        ) : (
          error && <p className="text-sm text-red-600">{error}</p>
        )}
        <button
          type="submit"
          disabled={wait > 0 || pin.length < 4}
          className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t.pinUnlock}
        </button>
        {cancel && (
          <a
            href={cancel.href}
            className="block w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {cancel.label}
          </a>
        )}
      </form>
      {showForgot && (
        <div className="space-y-1">
          <button type="button" onClick={forgot} className="text-sm text-gray-500 underline">
            {t.pinForgot}
          </button>
          {signOutFailed && <p className="text-sm text-red-600">{t.loadFailed}</p>}
        </div>
      )}
    </div>
  );
}
