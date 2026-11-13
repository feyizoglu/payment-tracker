"use client";

import { useLang } from "@/lib/i18n";
import {
  ROLE_DESC_KEYS,
  ROLE_NAME_KEYS,
  SPECIAL_ROLES,
  maxWolves,
  roleSummary,
  suggestWolves,
  wolfCount,
  type SpecialRole,
  type WolfSetup,
} from "@/lib/wolf-game";

const stepper =
  "h-10 w-10 rounded-full border border-gray-200 text-xl font-bold text-gray-900 hover:bg-gray-100 disabled:opacity-40";

export default function WolfRolesStep({
  value,
  onChange,
}: {
  value: WolfSetup;
  onChange: (next: WolfSetup) => void;
}) {
  const { t } = useLang();
  const wolves = wolfCount(value);
  const suggested = suggestWolves(value.players.length);
  const max = maxWolves(value.players.length);
  // A count set by hand no longer follows the player count.
  const setWolves = (next: number) => onChange({ ...value, wolves: next });
  const toggle = (role: SpecialRole, on: boolean) =>
    onChange({ ...value, specials: SPECIAL_ROLES.filter((r) => (r === role ? on : value.specials.includes(r))) });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.wolfWolves}</h3>
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label={t.wolfFewer}
            disabled={wolves <= 1}
            onClick={() => setWolves(wolves - 1)}
            className={stepper}
          >
            −
          </button>
          <span className="w-8 text-center text-2xl font-bold text-gray-900" aria-live="polite">
            {wolves}
          </span>
          <button
            type="button"
            aria-label={t.wolfMore}
            disabled={wolves >= max}
            onClick={() => setWolves(wolves + 1)}
            className={stepper}
          >
            +
          </button>
          <span className={`text-sm ${wolves === suggested ? "font-semibold text-gray-900" : "text-gray-500"}`}>
            {t.wolfSuggested.replace("{n}", String(suggested))}
          </span>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-100 bg-surface p-4">
        {SPECIAL_ROLES.map((role) => (
          <label key={role} className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-gray-900">{t[ROLE_NAME_KEYS[role]]}</span>
              <span className="block text-xs text-gray-400">{t[ROLE_DESC_KEYS[role]]}</span>
            </span>
            <input
              type="checkbox"
              checked={value.specials.includes(role)}
              onChange={(e) => toggle(role, e.target.checked)}
              className="h-5 w-5 shrink-0"
            />
          </label>
        ))}
      </section>

      <p className="text-center font-semibold text-gray-900">{roleSummary(value, t)}</p>
    </div>
  );
}
