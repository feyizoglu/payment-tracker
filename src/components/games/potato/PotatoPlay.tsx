"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME, fillTemplate, fuseStage } from "@/lib/hot-potato";

const TICK_MS = 200;
const PULSE_DURATION = { pulse: "1s", fast: "0.5s" } as const;

// The holder's screen, on the holder's colour. It only asks the game to check the fuse; the
// game decides when it goes off. Pass stable callbacks, or the timer and the listener restart
// on every render.
export default function PotatoPlay({
  holder,
  task,
  fuseMs,
  burntMs,
  litAt,
  onPass,
  onTick,
  onPause,
  onResume,
}: {
  holder: string;
  task: string;
  fuseMs: number;
  burntMs: number;
  litAt: number | null;
  onPass: () => void;
  onTick: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [onTick]);

  // Nobody explodes while the page is hidden or the phone is locked.
  useEffect(() => {
    const onVisibility = () => (document.hidden ? onPause() : onResume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [onPause, onResume]);

  const stage = fuseStage({ fuseMs, burntMs, litAt }, now);

  return (
    <div className="relative isolate space-y-4 text-center">
      {stage !== "calm" && (
        <div
          aria-hidden={true}
          data-pulse={stage}
          className="pointer-events-none absolute -inset-4 -z-10 animate-pulse rounded-2xl bg-white/40 sm:-inset-6"
          style={{ animationDuration: PULSE_DURATION[stage] }}
        />
      )}
      <p className="break-words text-2xl font-bold">{holder}</p>
      <div
        data-card
        className="flex min-h-56 items-center justify-center rounded-2xl p-6"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        <p className="break-words text-4xl font-bold">{task}</p>
      </div>
      <p className="text-sm opacity-80">{t.potatoSayDifferent}</p>
      <button
        type="button"
        onClick={onPass}
        aria-label={fillTemplate(t.potatoPassLabel, { name: holder })}
        className="w-full rounded-2xl py-10 text-4xl font-black"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.potatoPass}
      </button>
    </div>
  );
}
