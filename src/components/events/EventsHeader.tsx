"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown } from "lucide-react";
import { useLang } from "@/lib/i18n";
import AppNav from "@/components/AppNav";
import PushToggle from "@/components/PushToggle";
import ThemePicker from "@/components/ThemePicker";
import PinMenuItem from "@/components/lock/PinMenuItem";
import SignOutMenuItem from "@/components/SignOutMenuItem";

export default function EventsHeader({ active = "events" }: { active?: "events" | "games" | "words" } = {}) {
  const { data: session } = useSession();
  const { lang, setLang } = useLang();
  const [headerMenu, setHeaderMenu] = useState<"nav" | "user" | null>(null);

  return (
    <header className="bg-surface border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <AppNav active={active} open={headerMenu === "nav"} onOpenChange={(open) => setHeaderMenu(open ? "nav" : null)} />

        <div className="flex items-center gap-2">
          <PushToggle />
          <button
            onClick={() => setLang(lang === "en" ? "tr" : "en")}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            {lang === "en" ? "🇹🇷 TR" : "🇬🇧 EN"}
          </button>

          <div className="relative">
            <button
              onClick={() => setHeaderMenu((m) => (m === "user" ? null : "user"))}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-xs">
                {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className="hidden sm:block truncate max-w-[120px]">
                {session?.user?.name ?? session?.user?.email}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {headerMenu === "user" && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-surface rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-900 truncate">{session?.user?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                </div>
                <ThemePicker />
                <PinMenuItem />
                <SignOutMenuItem />
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
