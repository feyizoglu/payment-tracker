"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { THEME_PREFS, type ThemePref } from "@/lib/theme-pref";
import { readThemePref, setThemePref } from "@/lib/theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

export default function ThemePicker() {
  const { t } = useLang();
  // Only mounted inside the opened profile menu, never server-rendered, so storage is readable.
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const labels: Record<ThemePref, string> = { system: t.themeSystem, light: t.themeLight, dark: t.themeDark };

  return (
    <div className="px-3 py-2 border-b border-gray-100">
      <p className="text-xs text-gray-400 mb-1.5">{t.theme}</p>
      <div role="radiogroup" aria-label={t.theme} className="flex gap-1">
        {THEME_PREFS.map((option) => {
          const Icon = ICONS[option];
          const active = pref === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              title={labels[option]}
              onClick={() => {
                setPref(option);
                setThemePref(option);
              }}
              className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-lg text-xs transition ${
                active ? "bg-blue-50 text-blue-600 dark:text-blue-400 font-medium" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{labels[option]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
