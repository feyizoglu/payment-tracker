"use client";

import { ChevronRight, VenetianMask } from "lucide-react";
import GamesShell from "@/components/games/GamesShell";
import { useLang } from "@/lib/i18n";

export default function GamesPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.games} backHref="/dashboard">
      <a
        href="/games/imposter"
        className="flex items-center gap-4 rounded-xl border border-gray-100 bg-surface p-4 hover:border-purple-200 transition"
      >
        <div className="rounded-lg bg-purple-50 p-3">
          <VenetianMask className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{t.imposterTitle}</p>
          <p className="text-sm text-gray-500">{t.imposterDesc}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </a>
      <p className="mt-4 text-center text-xs text-gray-400">{t.gamesOffline}</p>
    </GamesShell>
  );
}
