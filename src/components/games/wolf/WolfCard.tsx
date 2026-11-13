"use client";

import { useLang } from "@/lib/i18n";
import { GAME_THEME, ROLE_NAME_KEYS, cardText, type GameState } from "@/lib/wolf-game";

// The inside of the held card: the dealt role, or tonight's task.
export default function WolfCard({ state }: { state: GameState }) {
  const { t } = useLang();
  const card = cardText(state, t);
  if (!card) return null;
  return (
    <>
      <p className="text-sm" style={{ color: GAME_THEME.muted }}>
        {card.heading}
      </p>
      <p className="text-4xl font-bold">{t[ROLE_NAME_KEYS[card.role]]}</p>
      {card.lines.map((line) => (
        <p key={line} className="text-lg">
          {line}
        </p>
      ))}
    </>
  );
}
