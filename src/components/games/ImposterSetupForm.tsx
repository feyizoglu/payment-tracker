"use client";

import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_LABEL_KEYS,
  MAX_IMPOSTERS,
  MAX_PLAYERS,
  MAX_TIMER_MINUTES,
  SETUP_ERROR_KEYS,
  maxImposters,
  validateSetup,
  type CategoryChoice,
  type ImposterMode,
  type ImposterSetup,
} from "@/lib/imposter";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

export default function ImposterSetupForm({
  value,
  onChange,
  onStart,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
  onStart: () => void;
}) {
  const { t } = useLang();
  const errors = validateSetup(value);
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-500">{t.imposterPlayers}</h2>
        {value.players.map((name, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={name}
              onChange={(e) => set({ players: value.players.map((p, j) => (j === i ? e.target.value : p)) })}
              placeholder={t.imposterPlayerName}
              className="flex-1 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-900"
            />
            <button
              type="button"
              onClick={() => set({ players: value.players.filter((_, j) => j !== i) })}
              className="rounded-lg px-2 text-gray-400 hover:bg-gray-100"
              aria-label={t.imposterRemovePlayer}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={value.players.length >= MAX_PLAYERS}
          onClick={() => set({ players: [...value.players, ""] })}
          className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
        >
          + {t.imposterAddPlayer}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-500">{t.imposterMode}</h2>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {(["no-word", "similar-word"] as ImposterMode[]).map((mode) => (
            <button key={mode} type="button" className={pill(value.mode === mode)} onClick={() => set({ mode })}>
              {mode === "no-word" ? t.imposterModeNoWord : t.imposterModeSimilar}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-500">{t.imposterCategory}</span>
          <select
            value={value.category}
            onChange={(e) => set({ category: e.target.value as CategoryChoice })}
            className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-900"
          >
            {CATEGORY_CHOICES.map((c) => (
              <option key={c} value={c}>
                {t[CATEGORY_LABEL_KEYS[c]]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
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
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-500">{t.imposterCount}</h2>
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

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          {errors.map((e) => (
            <li key={e}>{t[SETUP_ERROR_KEYS[e]]}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={errors.length > 0}
        onClick={onStart}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {t.imposterStart}
      </button>
    </div>
  );
}
