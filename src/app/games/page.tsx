"use client";

import { ChevronRight, MessageSquareText, Moon, VenetianMask } from "lucide-react";
import GamesShell from "@/components/games/GamesShell";
import { useLang } from "@/lib/i18n";

export default function GamesPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.games}>
      <div className="space-y-3">
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
        <a
          href="/games/word"
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-surface p-4 hover:border-blue-200 transition"
        >
          <div className="rounded-lg bg-blue-50 p-3">
            <MessageSquareText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">{t.wordTitle}</p>
            <p className="text-sm text-gray-500">{t.wordDesc}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </a>
        <a
          href="/games/wolf"
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-surface p-4 hover:border-purple-200 transition"
        >
          <div className="rounded-lg bg-purple-50 p-3">
            <Moon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">{t.wolfTitle}</p>
            <p className="text-sm text-gray-500">{t.wolfDesc}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </a>
      </div>
      <p className="mt-4 text-center text-xs text-gray-400">{t.gamesOffline}</p>
    </GamesShell>
  );
}
