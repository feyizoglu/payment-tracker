"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { isValidPin } from "@/lib/app-lock";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-center text-lg tracking-widest text-gray-900";

export default function PinSetup({ onDone, submitLabel }: { onDone: (pin: string) => void | Promise<void>; submitLabel?: string }) {
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPin(pin)) return setError(t.pinInvalid);
    if (pin !== repeat) return setError(t.pinMismatch);
    setBusy(true);
    await onDone(pin);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm text-gray-500">{t.pinNew}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className={inputClass}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-gray-500">{t.pinRepeat}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={repeat}
          onChange={(e) => setRepeat(e.target.value.replace(/\D/g, ""))}
          className={inputClass}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitLabel ?? t.pinSave}
      </button>
    </form>
  );
}
