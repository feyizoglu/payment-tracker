"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  GAME_THEME,
  WHO_ANSWER_COLORS,
  formatCountdown,
  nameSize,
  whoTimeLeft,
  type NameSize,
  type WhoPlayCard,
  type WhoResult,
} from "@/lib/who-game";

const TICK_MS = 200;
const NAME_CLASS = {
  xl: "text-6xl sm:text-7xl",
  lg: "text-5xl sm:text-6xl",
  md: "text-4xl sm:text-5xl",
  sm: "text-3xl sm:text-4xl",
} as const satisfies Record<NameSize, string>;

// The guesser holds the phone to their forehead, so the table reads the card and the guesser
// taps blind: Got it fills the top half and Pass the bottom one (top and bottom do not swap
// for someone facing the other way). The card lets taps through to the half under it. It only
// asks the game to check the clock; pass stable callbacks, or the timer and the listener
// restart on every render.
export default function WhoTurn({
  card,
  turnMs,
  usedMs,
  runningSince,
  onAnswer,
  onTick,
  onPause,
  onResume,
}: {
  card: WhoPlayCard;
  turnMs: number;
  usedMs: number;
  runningSince: number | null;
  onAnswer: (result: WhoResult) => void;
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

  // The time stops while the page is hidden or the phone is locked.
  useEffect(() => {
    const onVisibility = () => (document.hidden ? onPause() : onResume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [onPause, onResume]);

  const left = formatCountdown(Math.ceil(whoTimeLeft({ turnMs, usedMs, runningSince }, now) / 1000));
  const half = (result: WhoResult, label: string, align: string) => (
    <button
      type="button"
      onClick={() => onAnswer(result)}
      className={`flex flex-1 justify-center rounded-2xl p-5 text-3xl font-black ${align}`}
      style={{ backgroundColor: WHO_ANSWER_COLORS[result], color: GAME_THEME.ink }}
    >
      {label}
    </button>
  );

  return (
    <div className="relative flex min-h-[70vh] flex-1 flex-col gap-3">
      <div
        data-card
        className="pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 space-y-3 rounded-2xl px-4 py-6 text-center shadow-xl"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        <p
          role="timer"
          aria-label={`${t.whoTimeLeft} ${left}`}
          className="font-mono text-2xl font-bold"
          style={{ color: GAME_THEME.muted }}
        >
          {left}
        </p>
        <p
          key={card.id}
          className={`animate-[game-fade_150ms_ease-out] break-words font-black leading-tight ${NAME_CLASS[nameSize(card.name)]}`}
        >
          {card.name}
        </p>
        <p className="break-words text-xl" style={{ color: GAME_THEME.muted }}>
          {card.hint}
        </p>
      </div>
      {half("got", t.whoGotIt, "items-start")}
      {half("pass", t.whoPass, "items-end")}
    </div>
  );
}
