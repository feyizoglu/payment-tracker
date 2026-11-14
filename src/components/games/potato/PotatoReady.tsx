"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate } from "@/lib/hot-potato";

// Render on the starter's colour. The task stays hidden until Start lights the fuse.
export default function PotatoReady({ name, onStart }: { name: string; onStart: () => void }) {
  const { t } = useLang();

  return (
    <div className="space-y-6 py-6 text-center">
      <p className="break-words text-3xl font-bold">{fillTemplate(t.potatoStarts, { name })}</p>
      <p className="text-sm opacity-80">{t.potatoReadyHint}</p>
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-2xl py-5 text-xl font-bold"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.potatoStart}
      </button>
    </div>
  );
}
