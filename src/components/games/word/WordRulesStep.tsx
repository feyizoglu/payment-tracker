"use client";

import { useLang } from "@/lib/i18n";
import {
  PASS_LIMITS,
  ROUND_CHOICES,
  TARGET_CHOICES,
  TURN_SECONDS,
  WORD_END_BYS,
  WORD_MODES,
  WORD_MODE_KEYS,
  type WordSetup,
} from "@/lib/word-game";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

function choice<T>(label: string, options: readonly { value: T; label: string }[], value: T, onPick: (value: T) => void) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <h3 className="text-sm font-medium text-gray-500">{label}</h3>
      <div className="flex rounded-lg bg-gray-100 p-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            className={pill(o.value === value)}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function WordRulesStep({
  value,
  onChange,
}: {
  value: WordSetup;
  onChange: (next: WordSetup) => void;
}) {
  const { t } = useLang();
  const set = (patch: Partial<WordSetup>) => onChange({ ...value, ...patch });
  const numbers = (list: readonly number[]) => list.map((n) => ({ value: n, label: String(n) }));

  return (
    <div className="space-y-5">
      <div role="group" aria-label={t.wordMode} className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.wordMode}</h3>
        {WORD_MODES.map((mode) => {
          const active = value.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              onClick={() => set({ mode })}
              className={`block w-full rounded-xl border-2 bg-surface p-3 text-left transition ${
                active ? "border-white" : "border-gray-100 opacity-60 hover:opacity-90"
              }`}
            >
              <span className="block font-semibold text-gray-900">{t[WORD_MODE_KEYS[mode].label]}</span>
              <span className="block text-sm text-gray-500">{t[WORD_MODE_KEYS[mode].rule]}</span>
            </button>
          );
        })}
      </div>
      {choice(
        t.wordTurnTime,
        TURN_SECONDS.map((n): { value: number; label: string } => ({ value: n, label: t.wordSeconds.replace("{n}", String(n)) })),
        value.turnSeconds,
        (turnSeconds) => set({ turnSeconds })
      )}
      {choice(
        t.wordPasses,
        PASS_LIMITS.map((n): { value: number | null; label: string } => ({
          value: n,
          label: n === null ? t.wordPassesUnlimited : String(n),
        })),
        value.passLimit,
        (passLimit) => set({ passLimit })
      )}
      {choice(
        t.wordEndBy,
        WORD_END_BYS.map((endBy) => ({ value: endBy, label: endBy === "rounds" ? t.wordEndByRounds : t.wordEndByTarget })),
        value.endBy,
        (endBy) => set({ endBy })
      )}
      {value.endBy === "rounds"
        ? choice(t.wordRounds, numbers(ROUND_CHOICES), value.rounds, (rounds) => set({ rounds }))
        : choice(t.wordTarget, numbers(TARGET_CHOICES), value.target, (target) => set({ target }))}
    </div>
  );
}
