"use client";

import { GAME_THEME } from "@/lib/clue-game";

// The screen before a secret one: it names who may look and shows nothing secret itself.
export default function ClueGate({
  title,
  hint,
  label,
  onReveal,
  onColor = false,
}: {
  title: string;
  hint: string;
  label: string;
  onReveal: () => void;
  /** Rendered on a player's colour: the button is the game's dark one. */
  onColor?: boolean;
}) {
  return (
    <div className="space-y-6 py-10 text-center">
      <p className="break-words text-2xl font-bold">{title}</p>
      <p className="break-words text-sm opacity-80">{hint}</p>
      {onColor ? (
        <button
          type="button"
          onClick={onReveal}
          className="rounded-lg px-10 py-3 font-semibold"
          style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
        >
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={onReveal}
          className="rounded-lg bg-blue-600 px-10 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {label}
        </button>
      )}
    </div>
  );
}
