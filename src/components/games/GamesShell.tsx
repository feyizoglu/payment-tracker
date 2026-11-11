"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { prepareGamesOffline } from "@/lib/games-offline";

// Header + body for every games page. Plain <a> links on purpose: offline, a full page
// load is answered by the service worker, a client-side navigation is not.
export default function GamesShell({ title, backHref, children }: { title: string; backHref: string; children: ReactNode }) {
  const { t } = useLang();

  useEffect(() => {
    void prepareGamesOffline();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-surface border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href={backHref} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" aria-label={t.back}>
            <ArrowLeft className="w-5 h-5" />
          </a>
          <Gamepad2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h1 className="font-bold text-gray-900">{title}</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
