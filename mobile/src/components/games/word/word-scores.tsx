import { Text, View } from "react-native";

import { GAME_THEME, teamColor, type WordTeam } from "@ptracker/shared/word-game";

// Dark tiles with the team's colour as border and name: they read on the dark screen and on
// either team's colour.
export function WordScores({ teams, scores }: { teams: readonly WordTeam[]; scores: readonly number[] }) {
  return (
    <View className="flex-row gap-2">
      {teams.map((team, i) => (
        <View
          key={i}
          className="flex-1 items-center rounded-xl border-2 p-3"
          style={{ backgroundColor: GAME_THEME.bg, borderColor: teamColor(i) }}>
          <Text numberOfLines={1} className="text-sm font-semibold" style={{ color: teamColor(i) }}>
            {team.name}
          </Text>
          <Text className="text-3xl font-bold" style={{ color: GAME_THEME.text }}>
            {scores[i]}
          </Text>
        </View>
      ))}
    </View>
  );
}
