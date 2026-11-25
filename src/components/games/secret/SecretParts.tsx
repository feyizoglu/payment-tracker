"use client";

import type { CSSProperties } from "react";
import { useLang } from "@/lib/i18n";
import { fillTemplate } from "@/lib/word-game";
import {
  SECRET_COLORS,
  SECRET_KEY_ROWS,
  secretCanReveal,
  secretLines,
  secretTriesUsed,
  type SecretMark,
  type SecretRound,
  type SecretSlot,
} from "@/lib/secret-word";

type Palette = (typeof SECRET_COLORS)["light" | "dark"];

function slotStyle(mark: SecretSlot["mark"], c: Palette): CSSProperties {
  switch (mark) {
    case "hit":
      return { backgroundColor: c.hit, color: c.onHit, borderRadius: 9999 };
    case "near":
      return { color: c.ink, borderBottom: `4px solid ${c.near}` };
    case "miss":
      return { color: c.miss, textDecoration: "line-through", textDecorationThickness: 2 };
    case "typed":
      return { color: c.ink };
    case "empty":
      return { borderBottom: `2px solid ${c.line}` };
  }
}

/** One letter on the page; `size` is the slot's side in pixels. */
export function SecretLetter({ slot, palette, size = 40 }: { slot: SecretSlot; palette: Palette; size?: number }) {
  return (
    <span
      data-mark={slot.mark}
      className="flex items-center justify-center font-bold"
      style={{ width: size, height: size, fontSize: size * 0.55, ...slotStyle(slot.mark, palette) }}>
      {slot.letter}
    </span>
  );
}

export function SecretBoard({ round, palette }: { round: SecretRound; palette: Palette }) {
  return (
    <div className="relative rounded-2xl py-2 pl-10 pr-4" style={{ backgroundColor: palette.paper }}>
      <div className="absolute inset-y-0 left-7 w-px" style={{ backgroundColor: palette.margin }} />
      {secretLines(round).map((line, i) => (
        <div key={i} className="flex h-14 items-center justify-center gap-2" style={{ borderBottom: `1px solid ${palette.line}` }}>
          {line.map((slot, j) => (
            <SecretLetter key={j} slot={slot} palette={palette} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SecretLegend({ palette }: { palette: Palette }) {
  const { t } = useLang();
  const item = (mark: SecretMark, label: string) => (
    <span className="flex items-center gap-1">
      <SecretLetter slot={{ letter: "A", mark }} palette={palette} size={22} />
      {label}
    </span>
  );
  return (
    <div className="flex justify-center gap-4 text-xs text-gray-500">
      {item("hit", t.secretLegendHit)}
      {item("near", t.secretLegendNear)}
      {item("miss", t.secretLegendMiss)}
    </div>
  );
}

export function SecretReveal({ round, onReveal }: { round: SecretRound; onReveal: () => void }) {
  const { t } = useLang();
  return (
    <div className="text-center">
      <button
        type="button"
        disabled={!secretCanReveal(round)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onReveal}
        className="rounded-full border border-gray-200 px-3 py-1 text-sm font-semibold text-indigo-700 disabled:opacity-40 dark:text-indigo-300">
        {t.secretReveal}
      </button>
    </div>
  );
}

function keyStyle(mark: SecretMark | undefined, c: Palette): CSSProperties {
  const base: CSSProperties = { backgroundColor: c.key, color: c.ink };
  if (mark === "hit") return { ...base, backgroundColor: c.hit, color: c.onHit };
  if (mark === "near") return { ...base, boxShadow: `inset 0 -4px 0 ${c.near}` };
  if (mark === "miss") return { ...base, color: c.miss };
  return base;
}

export function SecretKeyboard({
  round,
  marks,
  palette,
  onKey,
}: {
  round: SecretRound;
  marks: Record<string, SecretMark>;
  palette: Palette;
  onKey: (key: string) => void;
}) {
  const { t } = useLang();
  const rows = SECRET_KEY_ROWS[round.lang];
  const key = "flex h-12 items-center justify-center rounded-md text-base font-semibold";
  // A clicked key must not keep the focus, or the physical Space and Enter would press it again.
  const keep = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <div className="touch-manipulation space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1">
          {i === rows.length - 1 && (
            <button type="button" aria-label={t.secretEnter} onMouseDown={keep} onClick={() => onKey("Enter")} className={`${key} flex-[1.6]`} style={keyStyle(undefined, palette)}>
              ↵
            </button>
          )}
          {row.map((letter) => (
            <button type="button" key={letter} onMouseDown={keep} onClick={() => onKey(letter)} className={`${key} min-w-0 flex-1`} style={keyStyle(marks[letter], palette)}>
              {letter}
            </button>
          ))}
          {i === rows.length - 1 && (
            <button type="button" aria-label={t.secretDelete} onMouseDown={keep} onClick={() => onKey("Backspace")} className={`${key} flex-[1.6]`} style={keyStyle(undefined, palette)}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function SecretResult({
  round,
  streak,
  best,
  newBest,
  onNext,
  onBack,
}: {
  round: SecretRound;
  streak: number;
  best: number;
  newBest: boolean;
  onNext: () => void;
  /** Runs before the link is followed; it may cancel it. */
  onBack: (e: { preventDefault: () => void }) => void;
}) {
  const { t } = useLang();
  const won = round.phase === "won";
  return (
    <div className="space-y-2 rounded-2xl border border-gray-100 bg-surface p-4 text-center text-gray-900">
      <p className="text-lg font-semibold">
        {won ? fillTemplate(t.secretWon, { n: String(secretTriesUsed(round)) }) : fillTemplate(t.secretLost, { word: round.card.word })}
      </p>
      {won && <p className="text-sm">{fillTemplate(t.secretStreak, { n: String(streak) })}</p>}
      {newBest ? (
        <p className="font-semibold text-indigo-600 dark:text-indigo-400">{t.soloNewBest}</p>
      ) : (
        <p className="text-sm text-gray-500">{fillTemplate(t.soloBest, { n: String(best) })}</p>
      )}
      <div className="flex gap-2 pt-2">
        <a href="/games" onClick={onBack} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm">
          {t.soloBackToGames}
        </a>
        <button type="button" onClick={onNext} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white">
          {won ? t.secretNext : t.soloAgain}
        </button>
      </div>
    </div>
  );
}
