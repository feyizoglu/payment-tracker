"use client";

import { useLang } from "@/lib/i18n";
import {
  MAX_IMPOSTERS,
  MAX_TIMER_MINUTES,
  maxImposters,
  type ImposterMode,
  type ImposterSetup,
} from "@/lib/imposter";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

export default function SetupRulesStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.imposterMode}</h3>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {(["no-word", "similar-word"] as ImposterMode[]).map((mode) => (
            <button key={mode} type="button" className={pill(value.mode === mode)} onClick={() => set({ mode })}>
              {mode === "no-word" ? t.imposterModeNoWord : t.imposterModeSimilar}
            </button>
          ))}
        </div>
        {value.mode === "similar-word" && (
          <label className="flex items-center justify-between gap-3 pt-1">
            <span>
              <span className="block text-gray-900">{t.imposterKnowsRole}</span>
              <span className="block text-xs text-gray-400">{t.imposterKnowsRoleHint}</span>
            </span>
            <input
              type="checkbox"
              checked={value.imposterKnows}
              onChange={(e) => set({ imposterKnows: e.target.checked })}
              className="h-5 w-5 shrink-0"
            />
          </label>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.imposterCount}</h3>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {Array.from({ length: MAX_IMPOSTERS }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={n > limit}
              className={`${pill(value.imposterCount === n)} disabled:opacity-40`}
              onClick={() => set({ imposterCount: n })}
            >
              {n}
            </button>
          ))}
        </div>
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

      <section className="space-y-3 rounded-xl border border-gray-100 bg-surface p-4">
        <label className="flex items-center justify-between">
          <span className="text-gray-900">{t.imposterVoting}</span>
          <input
            type="checkbox"
            checked={value.voting}
            onChange={(e) => set({ voting: e.target.checked, scoreboard: e.target.checked && value.scoreboard })}
            className="h-5 w-5"
          />
        </label>
        <label className={`flex items-center justify-between ${value.voting ? "" : "opacity-50"}`}>
          <span>
            <span className="block text-gray-900">{t.imposterScoreboard}</span>
            {!value.voting && <span className="block text-xs text-gray-400">{t.imposterScoreboardHint}</span>}
          </span>
          <input
            type="checkbox"
            disabled={!value.voting}
            checked={value.scoreboard}
            onChange={(e) => set({ scoreboard: e.target.checked })}
            className="h-5 w-5"
          />
        </label>
      </section>
    </div>
  );
}
