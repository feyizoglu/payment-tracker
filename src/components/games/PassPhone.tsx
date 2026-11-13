"use client";

import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME } from "@/lib/imposter";

// The hand-over screen of the secret vote: the ballot only appears after the named player
// presses the button. It sits on that player's colour, so it sets no themed colours.
export default function PassPhone({
  name,
  revealed,
  revealLabel,
  onReveal,
  children,
}: {
  name: string;
  revealed: boolean;
  revealLabel: string;
  onReveal: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  if (revealed) return <div className="space-y-6 text-center">{children}</div>;
  return (
    <div className="space-y-6 py-10 text-center">
      <p className="text-2xl font-bold">{t.imposterPassTo.replace("{name}", () => name)}</p>
      <p className="text-sm opacity-80">{t.imposterPassHint}</p>
      <button
        type="button"
        onClick={onReveal}
        className="rounded-lg px-10 py-3 font-semibold"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {revealLabel}
      </button>
    </div>
  );
}
