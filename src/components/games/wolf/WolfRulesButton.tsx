"use client";

import { useLang } from "@/lib/i18n";

// Opens the This game screen during play. It takes the text colour of the screen it is on.
export default function WolfRulesButton({ onClick }: { onClick: () => void }) {
  const { t } = useLang();
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg px-3 py-1 text-sm font-semibold underline opacity-80 hover:opacity-100"
      >
        {t.wolfRules}
      </button>
    </div>
  );
}
