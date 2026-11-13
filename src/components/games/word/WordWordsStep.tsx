"use client";

import { useLang } from "@/lib/i18n";
import { playerColor } from "@/lib/imposter";
import {
  GAME_THEME,
  WORD_CATEGORY_CHOICES,
  WORD_CATEGORY_EMOJI,
  WORD_CATEGORY_LABEL_KEYS,
  WORD_DIFFICULTIES,
  WORD_DIFFICULTY_KEYS,
  type WordSetup,
} from "@/lib/word-game";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

export default function WordWordsStep({
  value,
  onChange,
}: {
  value: WordSetup;
  onChange: (next: WordSetup) => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <div role="group" aria-label={t.wordCategory} className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.wordCategory}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {WORD_CATEGORY_CHOICES.map((c, i) => {
            const active = value.category === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...value, category: c })}
                className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-4 font-semibold transition ${
                  active ? "ring-4 ring-white" : "opacity-60 hover:opacity-90"
                }`}
                style={{ backgroundColor: playerColor(i), color: GAME_THEME.ink }}
              >
                <span className="text-3xl" aria-hidden>
                  {WORD_CATEGORY_EMOJI[c]}
                </span>
                <span>{t[WORD_CATEGORY_LABEL_KEYS[c]]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div role="group" aria-label={t.wordDifficulty} className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.wordDifficulty}</h3>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {WORD_DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.difficulty === d}
              className={pill(value.difficulty === d)}
              onClick={() => onChange({ ...value, difficulty: d })}
            >
              {t[WORD_DIFFICULTY_KEYS[d]]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
