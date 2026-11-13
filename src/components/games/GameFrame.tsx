import type { ReactNode } from "react";
import { GAME_THEME } from "@/lib/imposter";

// The game draws on its own dark background whatever the app theme is: the `dark` class
// switches the themed gray classes inside to their dark values. `color` replaces the
// background on the screens that belong to one player; text there is dark.
export default function GameFrame({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <div
      className="dark rounded-2xl p-4 sm:p-6"
      style={{ backgroundColor: color ?? GAME_THEME.bg, color: color ? GAME_THEME.ink : GAME_THEME.text }}
    >
      {children}
    </div>
  );
}
