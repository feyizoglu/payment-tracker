"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ChevronDown, CreditCard, LogOut } from "lucide-react";
import { useLang } from "@/lib/i18n";

export default function EventsHeader() {
  const { data: session } = useSession();
  const { lang, setLang, t } = useLang();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" />
            <span className="font-bold text-gray-900">PayTrack</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition font-medium"
            >
              {t.dashboard}
            </Link>
            <Link
              href="/economy"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition font-medium"
            >
              {t.economy}
            </Link>
            <Link
              href="/events"
              className="px-3 py-1.5 rounded-lg text-sm text-purple-700 bg-purple-50 font-semibold"
            >
              {t.events}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "tr" : "en")}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            {lang === "en" ? "🇹🇷 TR" : "🇬🇧 EN"}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className="hidden sm:block truncate max-w-[120px]">
                {session?.user?.name ?? session?.user?.email}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-900 truncate">{session?.user?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition"
                >
                  <LogOut className="w-4 h-4" />
                  {t.signOut}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
