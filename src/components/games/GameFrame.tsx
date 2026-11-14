import type { ReactNode } from "react";
import { GAME_THEME } from "@/lib/imposter";

// The game draws on its own dark background whatever the app theme is: the `dark` class
// switches the themed gray classes inside to their dark values. `color` replaces the
// background on the screens that belong to one player; text there is dark. `cover` fills
// the whole viewport above the page's header, for a screen tapped blind: no header link can
// be hit by mistake.
export default function GameFrame({ color, cover = false, children }: { color?: string; cover?: boolean; children: ReactNode }) {
  return (
    <div
      className={cover ? "dark fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-contain p-4" : "dark rounded-2xl p-4 sm:p-6"}
      style={{ backgroundColor: color ?? GAME_THEME.bg, color: color ? GAME_THEME.ink : GAME_THEME.text }}
    >
      {children}
    </div>
  );
}
