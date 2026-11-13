import { Pressable, Text } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME } from "@ptracker/shared/wolf-game";

// Opens the This game screen during play. `ink`: it sits on a player's colour.
export function WolfRulesButton({ onPress, ink = false }: { onPress: () => void; ink?: boolean }) {
  const { t } = useLang();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} className="self-end px-2 py-1">
      <Text
        className={`text-sm font-semibold underline ${ink ? "" : "text-gray-500"}`}
        style={ink ? { color: GAME_THEME.ink } : undefined}>
        {t.wolfRules}
      </Text>
    </Pressable>
  );
}
