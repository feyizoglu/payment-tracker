"use client";

import { useLang } from "@/lib/i18n";
import { MAX_TIMER_MINUTES, type NightMode, type WolfSetup } from "@/lib/wolf-game";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

export default function WolfRulesStep({
  value,
  onChange,
}: {
  value: WolfSetup;
  onChange: (next: WolfSetup) => void;
}) {
  const { t } = useLang();
  const set = (patch: Partial<WolfSetup>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.wolfNight}</h3>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {(["pass", "narrator"] as NightMode[]).map((night) => (
            <button
              key={night}
              type="button"
              aria-pressed={value.night === night}
              className={pill(value.night === night)}
              onClick={() => set({ night })}
            >
              {night === "pass" ? t.wolfNightPass : t.wolfNightNarrator}
            </button>
          ))}
        </div>
        {value.night === "narrator" && <p className="text-xs text-gray-400">{t.wolfNightNarratorHint}</p>}
      </section>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-gray-500">{t.imposterTimer}</span>
        <select
          value={value.timerMinutes}
          onChange={(e) => set({ timerMinutes: Number(e.target.value) })}
          className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-900"
        >
          {Array.from({ length: MAX_TIMER_MINUTES + 1 }, (_, m) => (
            <option key={m} value={m}>
              {m === 0 ? t.imposterTimerOff : t.imposterMinutes.replace("{n}", String(m))}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-surface p-4">
        <span className="text-gray-900">{t.wolfShowRoles}</span>
        <input
          type="checkbox"
          checked={value.showRoles}
          onChange={(e) => set({ showRoles: e.target.checked })}
          className="h-5 w-5 shrink-0"
        />
      </label>
    </div>
  );
}
