import { Pressable, Text, TextInput, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, WORD_MAX_TEAM, shuffleTeams, teamColor, type WordSetup, type WordTeam } from "@ptracker/shared/word-game";

const placeholder = "rgba(17, 24, 39, 0.45)";

export function WordTeamsStep({
  value,
  onChange,
}: {
  value: WordSetup;
  onChange: (next: WordSetup) => void;
}) {
  const { t } = useLang();
  const setTeam = (i: number, team: WordTeam) =>
    onChange({ ...value, teams: value.teams.map((x, j) => (j === i ? team : x)) as [WordTeam, WordTeam] });

  return (
    <View className="gap-4">
      {value.teams.map((team, i) => {
        const full = team.players.length >= WORD_MAX_TEAM;
        return (
          <View key={i} className="gap-2 rounded-2xl p-3" style={{ backgroundColor: teamColor(i) }}>
            <TextInput
              className="py-1 text-xl font-bold"
              style={{ color: GAME_THEME.ink }}
              value={team.name}
              onChangeText={(name) => setTeam(i, { ...team, name })}
              accessibilityLabel={t.wordTeamName}
              placeholder={t.wordTeamName}
              placeholderTextColor={placeholder}
            />
            {team.players.map((name, p) => (
              <View
                key={p}
                className="flex-row items-center gap-2 rounded-xl px-3"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.35)" }}>
                <TextInput
                  className="flex-1 py-2.5 text-lg font-semibold"
                  style={{ color: GAME_THEME.ink }}
                  value={name}
                  onChangeText={(next) =>
                    setTeam(i, { ...team, players: team.players.map((x, j) => (j === p ? next : x)) })
                  }
                  accessibilityLabel={t.wordPlayerName}
                  placeholder={t.wordPlayerName}
                  placeholderTextColor={placeholder}
                />
                <Pressable
                  onPress={() => setTeam(i, { ...team, players: team.players.filter((_, j) => j !== p) })}
                  accessibilityRole="button"
                  accessibilityLabel={t.wordRemovePlayer}
                  hitSlop={8}
                  className="px-2 py-2">
                  <Text className="text-lg" style={{ color: GAME_THEME.ink }}>
                    ✕
                  </Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              disabled={full}
              accessibilityRole="button"
              accessibilityState={{ disabled: full }}
              onPress={() => setTeam(i, { ...team, players: [...team.players, ""] })}
              className={`rounded-xl border border-dashed py-3 ${full ? "opacity-50" : ""}`}
              style={{ borderColor: "rgba(17, 24, 39, 0.4)" }}>
              <Text className="text-center text-sm font-semibold" style={{ color: GAME_THEME.ink }}>
                + {t.wordAddPlayer}
              </Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(shuffleTeams(value, Math.random))}
        className="rounded-lg border border-gray-200 py-3">
        <Text className="text-center text-base text-gray-600">🔀 {t.wordShuffle}</Text>
      </Pressable>
    </View>
  );
}
