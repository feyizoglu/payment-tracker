"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  GAME_THEME,
  WORD_ANSWER_LOOK,
  WORD_COLORS,
  WORD_TIME_UP_MS,
  WORD_WARN_SECONDS,
  formatCountdown,
  remainingSeconds,
  type WordCard,
  type WordMode,
  type WordResult,
} from "@/lib/word-game";

// The describer's screen. Mount it with `key` per turn so the clock starts fresh; the
// parent passes a stable `onTimeUp`, or the pause before it would restart on every render.
export default function WordTurn({
  card,
  teamName,
  mode,
  endsAt,
  passLimit,
  passesLeft,
  onAnswer,
  onTimeUp,
}: {
  card: WordCard;
  teamName: string;
  mode: WordMode;
  endsAt: number;
  passLimit: number | null;
  passesLeft: number | null;
  onAnswer: (result: WordResult) => void;
  onTimeUp: () => void;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const left = remainingSeconds(endsAt, now);
  const over = left === 0;
  const warn = left <= WORD_WARN_SECONDS;

  useEffect(() => {
    if (!over) return;
    const id = setTimeout(onTimeUp, WORD_TIME_UP_MS);
    return () => clearTimeout(id);
  }, [over, onTimeUp]);

  // The text changes only twice per turn, so it is read out only then.
  const announcement = over ? t.wordTimeUp : warn ? t.wordSecondsLeft.replace("{n}", String(WORD_WARN_SECONDS)) : "";
  const answer = "flex-1 rounded-xl border-2 py-4 text-lg font-bold disabled:opacity-40";
  const look = (result: WordResult) => ({
    backgroundColor: WORD_ANSWER_LOOK[result].fill,
    color: WORD_ANSWER_LOOK[result].text,
    borderColor: GAME_THEME.bg,
  });

  return (
    <div className="space-y-4 text-center">
      <p className="font-semibold">{teamName}</p>
      <p
        role="timer"
        className={`mx-auto w-fit rounded-full px-6 py-1 font-mono text-5xl font-bold ${warn && !over ? "animate-pulse" : ""}`}
        style={{ backgroundColor: GAME_THEME.bg, color: warn ? WORD_COLORS.warn : GAME_THEME.text }}
      >
        {formatCountdown(left)}
      </p>
      <p aria-live="assertive" className="sr-only">
        {announcement}
      </p>
      <div
        data-card
        className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl p-6"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {over ? (
          <p className="text-4xl font-bold">{t.wordTimeUp}</p>
        ) : (
          <div key={card.id} className="animate-[game-fade_150ms_ease-out] space-y-4">
            <p className="break-words text-4xl font-bold">{card.word}</p>
            {mode === "forbidden" ? (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide" style={{ color: GAME_THEME.muted }}>
                  {t.wordForbiddenLabel}
                </p>
                <ul className="space-y-1 text-xl font-semibold" style={{ color: WORD_COLORS.warn }}>
                  {card.forbidden.map((word) => (
                    <li key={word}>{word}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={{ color: GAME_THEME.muted }}>{mode === "mime" ? t.wordNoTalking : t.wordFreeHint}</p>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={over}
          onClick={() => onAnswer("foul")}
          className={answer}
          style={look("foul")}
        >
          {t.wordFoul}
        </button>
        {passLimit !== 0 && (
          <button
            type="button"
            disabled={over || passesLeft === 0}
            onClick={() => onAnswer("pass")}
            aria-label={passesLeft === null ? t.wordPass : t.wordPassesLeft.replace("{n}", String(passesLeft))}
            className={answer}
            style={look("pass")}
          >
            {passesLeft === null ? t.wordPass : `${t.wordPass} (${passesLeft})`}
          </button>
        )}
        <button
          type="button"
          disabled={over}
          onClick={() => onAnswer("correct")}
          className={answer}
          style={look("correct")}
        >
          {t.wordCorrect}
        </button>
      </div>
    </div>
  );
}
