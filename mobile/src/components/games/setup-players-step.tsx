import { Pressable, Text, TextInput, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, MAX_PLAYERS, playerColor, type ImposterSetup } from "@ptracker/shared/imposter";

export function SetupPlayersStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  const setPlayers = (players: string[]) => onChange({ ...value, players });
  const full = value.players.length >= MAX_PLAYERS;

  return (
    <View className="gap-2">
      {value.players.map((name, i) => (
        <View key={i} className="flex-row items-center gap-2 rounded-2xl px-4 py-1" style={{ backgroundColor: playerColor(i) }}>
          <TextInput
            className="flex-1 py-2.5 text-lg font-semibold"
            style={{ color: GAME_THEME.ink }}
            value={name}
            onChangeText={(next) => setPlayers(value.players.map((p, j) => (j === i ? next : p)))}
            accessibilityLabel={t.imposterPlayerName}
            placeholder={t.imposterPlayerName}
            placeholderTextColor="rgba(17, 24, 39, 0.45)"
          />
          <Pressable
            onPress={() => setPlayers(value.players.filter((_, j) => j !== i))}
            accessibilityRole="button"
            accessibilityLabel={t.imposterRemovePlayer}
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
        onPress={() => setPlayers([...value.players, ""])}
        className={`rounded-2xl border border-dashed border-gray-300 py-3 ${full ? "opacity-50" : ""}`}>
        <Text className="text-center text-sm text-gray-500">+ {t.imposterAddPlayer}</Text>
      </Pressable>
    </View>
  );
}
