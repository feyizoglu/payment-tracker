"use client";

import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";

// The hand-over screen used for dealing cards and for secret votes: the content only
// appears after the named player presses the button.
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
      <p className="text-2xl font-bold text-gray-900">{t.imposterPassTo.replace("{name}", () => name)}</p>
      <p className="text-sm text-gray-500">{t.imposterPassHint}</p>
      <button
        type="button"
        onClick={onReveal}
        className="rounded-lg bg-blue-600 px-10 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {revealLabel}
      </button>
    </div>
  );
}
