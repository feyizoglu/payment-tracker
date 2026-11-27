"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CreditCard, Menu, X } from "lucide-react";
import { useLang } from "@/lib/i18n";

export type AppSection = "dashboard" | "economy" | "events" | "games" | "words";

const PANEL_ID = "app-nav-menu";
// Tailwind's lg, which is in rem and so follows the browser's font size.
const WIDE = "(min-width: 64rem)";
const PURPLE = "text-purple-700 dark:text-purple-400 bg-purple-50 font-semibold";
const ACTIVE: Record<AppSection, string> = {
  dashboard: "text-blue-700 dark:text-blue-400 bg-blue-50 font-semibold",
  economy: "text-green-700 dark:text-green-400 bg-green-50 font-semibold",
  events: PURPLE,
  games: PURPLE,
  words: PURPLE,
};
const IDLE = "text-gray-500 hover:bg-gray-100 transition font-medium";

/** The header owns `open` so that its user menu and this menu are never open together. */
export default function AppNav({
  active,
  open,
  onOpenChange,
}: {
  active: AppSection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLang();
  const sections: { key: AppSection; href: string; label: string }[] = [
    { key: "dashboard", href: "/dashboard", label: t.dashboard },
    { key: "economy", href: "/economy", label: t.economy },
    { key: "events", href: "/events", label: t.events },
    { key: "games", href: "/games", label: t.games },
    { key: "words", href: "/words", label: t.wordsTitle },
  ];
  const tone = (key: AppSection) => (key === active ? ACTIVE[key] : IDLE);
  const current = (key: AppSection) => (key === active ? ("page" as const) : undefined);
  const close = () => onOpenChange(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // On window, not the nav: a clicked button does not take focus in Safari. The panel hides
  // with lg:hidden, so an open menu would come back when a wide window is narrowed again.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia(WIDE);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
      onOpenChange(false);
      toggleRef.current?.focus();
    };
    const onWide = () => {
      if (wide.matches) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open, onOpenChange]);

  return (
    <div className="flex items-center gap-2 lg:gap-4">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={t.menu}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        className="lg:hidden relative z-50 -ml-1.5 p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      <div className="flex items-center gap-2">
        <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <span className="hidden sm:inline font-bold text-gray-900">PayTrack</span>
      </div>
      <nav className="hidden lg:flex items-center gap-1">
        {sections.map((s) => (
          <Link key={s.key} href={s.href} aria-current={current(s.key)} className={`px-3 py-1.5 rounded-lg text-sm ${tone(s.key)}`}>
            {s.label}
          </Link>
        ))}
      </nav>
      {open ? <div aria-hidden="true" onClick={close} className="lg:hidden fixed inset-0 z-30" /> : null}
      <nav id={PANEL_ID} hidden={!open} className="lg:hidden absolute inset-x-0 top-full z-50 border-b border-gray-100 bg-surface shadow-lg">
        <ul className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex flex-col gap-1">
          {sections.map((s) => (
            <li key={s.key}>
              <Link
                href={s.href}
                aria-current={current(s.key)}
                onClick={close}
                className={`block px-3 py-2.5 rounded-lg text-sm ${tone(s.key)}`}
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
