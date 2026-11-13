"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME } from "@/lib/imposter";
import { isDesktopPointer, subscribeDesktopPointer } from "@/lib/desktop-pointer";

// Without these a long press on a phone selects text, opens the context menu or is taken
// for a scroll, and the browser cancels the hold.
const holdStyle = { touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as const;

// One player's turn while the cards are dealt. On touch the card shows only while it is
// held; with a mouse it has a Show / Hide button. Mount it with `key={turn}` so an open
// card can never carry over to the next player.
export default function DealTurn({
  name,
  revealed,
  onReveal,
  onNext,
  children,
}: {
  name: string;
  /** The reducer accepted this player's reveal: they have seen their card. */
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  // False during prerender and before hydration: the hold card also works with a mouse.
  const desktop = useSyncExternalStore(subscribeDesktopPointer, isDesktopPointer, () => false);
  // The pointer mode the card was opened in, null while it is closed. A card opened in one
  // mode is closed in the other: that mode's handlers would never see the release.
  const [openedIn, setOpenedIn] = useState<boolean | null>(null);
  // Cleared on every mode change, or a flip back to the opening mode would show it again.
  const [lastMode, setLastMode] = useState(desktop);
  if (lastMode !== desktop) {
    setLastMode(desktop);
    setOpenedIn(null);
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setOpenedIn(null);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The reducer ignores a reveal that comes too soon after the last tap. The card only
  // shows once the reveal was accepted, so "has seen it" and "may pass the phone on" never
  // disagree. Asking again after that would restart the tap guard and swallow Next.
  const show = () => {
    if (!revealed) onReveal();
    setOpenedIn(desktop);
  };
  const hide = () => setOpenedIn(null);
  const shown = openedIn === desktop && revealed;

  const hold = desktop
    ? undefined
    : {
        role: "button",
        tabIndex: 0,
        "aria-label": shown ? undefined : t.imposterHoldToSee,
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          if (e.button !== undefined && e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // The pointer may already be gone; the card still has to open.
          }
          show();
        },
        onPointerUp: hide,
        onPointerCancel: hide,
        onPointerLeave: hide,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (e.repeat) return;
          if (shown) hide();
          else show();
        },
        onBlur: hide,
        onContextMenu: (e: MouseEvent<HTMLDivElement>) => e.preventDefault(),
      };

  return (
    <div className="space-y-6 text-center">
      <p className="text-2xl font-bold">{t.imposterPassTo.replace("{name}", () => name)}</p>
      <p className="text-sm opacity-80">{t.imposterPassHint}</p>
      <div
        data-card
        className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text, ...(desktop ? null : holdStyle) }}
        {...hold}
      >
        {shown ? (
          <div className="animate-[game-fade_150ms_ease-out] space-y-2">{children}</div>
        ) : (
          <p className="text-lg font-semibold" style={{ color: GAME_THEME.muted }}>
            {desktop ? "?" : t.imposterHoldToSee}
          </p>
        )}
        {desktop && (
          <button
            type="button"
            onClick={shown ? hide : show}
            className="rounded-lg px-8 py-2 font-semibold"
            style={{ backgroundColor: GAME_THEME.text, color: GAME_THEME.ink }}
          >
            {shown ? t.imposterHide : t.imposterShow}
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={!revealed}
        onClick={onNext}
        className="rounded-lg px-10 py-3 font-semibold disabled:opacity-40"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.imposterNextPlayer}
      </button>
    </div>
  );
}
