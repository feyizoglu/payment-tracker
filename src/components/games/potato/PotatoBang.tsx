"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME, POTATO_NEXT_LOCK_MS, POTATO_VIBRATE_MS, fillTemplate } from "@/lib/hot-potato";

// Mount it with `key` per bang: it vibrates once when it appears.
export default function PotatoBang({
  name,
  livesLeft,
  bangAt,
  onNext,
}: {
  name: string;
  livesLeft: number;
  bangAt: number;
  onNext: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(POTATO_VIBRATE_MS);
    } catch {
      // Vibration is a bonus: a browser that refuses it changes nothing.
    }
  }, []);

  // A frantic Pass tap must not skip the bang: Next opens a moment after it.
  useEffect(() => {
    const id = setTimeout(() => setOpen(true), Math.max(0, bangAt + POTATO_NEXT_LOCK_MS - Date.now()));
    return () => clearTimeout(id);
  }, [bangAt]);

  const status =
    livesLeft === 0
      ? t.potatoOut
      : livesLeft === 1
        ? t.potatoLifeLeft
        : fillTemplate(t.potatoLivesLeft, { n: String(livesLeft) });

  return (
    <div className="space-y-8 py-8 text-center">
      <div role="alert" className="space-y-3">
        <p className="animate-[game-fade_150ms_ease-out] text-6xl font-black tracking-wider">{t.potatoBang}</p>
        <p className="break-words text-3xl font-bold">{name}</p>
        <p className="text-xl font-semibold">{status}</p>
      </div>
      <button
        type="button"
        disabled={!open}
        onClick={onNext}
        className="w-full rounded-2xl py-4 text-lg font-bold disabled:opacity-40"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.potatoNext}
      </button>
    </div>
  );
}
