import { Text, View } from "react-native";

import { GAME_THEME } from "@ptracker/shared/who-game";

// Dark tiles with the side's colour as border and name, for players or teams.
export function WhoScores({
  names,
  colors,
  scores,
}: {
  names: readonly string[];
  colors: readonly string[];
  scores: readonly number[];
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {names.map((name, i) => (
        <View
          key={i}
          className="grow basis-[45%] items-center rounded-xl border-2 p-3"
          style={{ backgroundColor: GAME_THEME.bg, borderColor: colors[i] }}>
          <Text numberOfLines={1} className="text-sm font-semibold" style={{ color: colors[i] }}>
            {name}
          </Text>
          <Text className="text-3xl font-bold" style={{ color: GAME_THEME.text }}>
            {scores[i]}
          </Text>
        </View>
      ))}
    </View>
  );
}
