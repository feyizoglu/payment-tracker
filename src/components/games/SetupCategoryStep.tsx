"use client";

import { useLang } from "@/lib/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEYS,
  GAME_THEME,
  playerColor,
  type ImposterSetup,
} from "@/lib/imposter";

export default function SetupCategoryStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CATEGORY_CHOICES.map((c, i) => {
        const active = value.category === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ ...value, category: c })}
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-5 font-semibold transition ${
              active ? "ring-4 ring-white" : "opacity-60 hover:opacity-90"
            }`}
            style={{ backgroundColor: playerColor(i), color: GAME_THEME.ink }}
          >
            <span className="text-3xl" aria-hidden>
              {CATEGORY_EMOJI[c]}
            </span>
            <span>{t[CATEGORY_LABEL_KEYS[c]]}</span>
          </button>
        );
      })}
    </div>
  );
}
