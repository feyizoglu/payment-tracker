import { Text } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, ROLE_NAME_KEYS, cardText, type GameState } from "@ptracker/shared/wolf-game";

// The inside of the held card: the dealt role, or tonight's task.
export function WolfCard({ state }: { state: GameState }) {
  const { t } = useLang();
  const card = cardText(state, t);
  if (!card) return null;
  return (
    <>
      <Text className="text-sm" style={{ color: GAME_THEME.muted }}>
        {card.heading}
      </Text>
      <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
        {t[ROLE_NAME_KEYS[card.role]]}
      </Text>
      {card.lines.map((line) => (
        <Text key={line} className="text-center text-lg" style={{ color: GAME_THEME.text }}>
          {line}
        </Text>
      ))}
    </>
  );
}
