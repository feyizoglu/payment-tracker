"use client";

import { useLang } from "@/lib/i18n";
import { ROLE_DESC_KEYS, ROLE_NAME_KEYS, rolesInPlay, type WolfSetup } from "@/lib/wolf-game";

// What this game holds, never who holds it. Before every deal it has Deal the cards (and Back
// to the setup); opened from a Rules button during play it only closes.
export default function WolfThisGame({
  setup,
  onDeal,
  onBack,
  onClose,
}: {
  setup: WolfSetup;
  onDeal?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const { t } = useLang();
  const primary = "flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-gray-900">{t.wolfThisGame}</h2>
      <ul className="space-y-2">
        {rolesInPlay(setup).map(({ role, count }) => (
          <li key={role} className="rounded-xl border border-gray-100 bg-surface p-3">
            <p className="font-semibold text-gray-900">
              {t[ROLE_NAME_KEYS[role]]} ×{count}
            </p>
            <p className="text-sm text-gray-500">{t[ROLE_DESC_KEYS[role]]}</p>
          </li>
        ))}
      </ul>
      <section className="space-y-1">
        <h3 className="text-sm font-medium text-gray-500">{t.wolfHowEnds}</h3>
        <p className="text-gray-900">{t.wolfVillageWinsRule}</p>
        <p className="text-gray-900">{t.wolfWolvesWinRule}</p>
      </section>
      <p className="text-sm text-gray-500">{setup.night === "pass" ? t.wolfPassNote : t.wolfNarratorNote}</p>
      <p className="text-sm text-gray-500">{t.wolfSilent}</p>
      <div className="flex gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
          >
            {t.back}
          </button>
        )}
        {onDeal && (
          <button type="button" onClick={onDeal} className={primary}>
            {t.wolfDeal}
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className={primary}>
            {t.wolfClose}
          </button>
        )}
      </div>
    </div>
  );
}
