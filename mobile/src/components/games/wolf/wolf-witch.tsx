import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, canHeal, pickOptions, type GameState } from "@ptracker/shared/wolf-game";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";

// The witch's choices, on her visit (`ink`: on her colour) and on the narrator's witch line.
export function WolfWitch({
  state,
  onHeal,
  onPick,
  note,
  ink = false,
}: {
  state: GameState;
  onHeal: () => void;
  onPick: (seat: number) => void;
  note?: (seat: number) => string;
  ink?: boolean;
}) {
  const { t } = useLang();
  const night = state.night;
  if (!night) return null;
  const names = state.setup.players;
  const victim = night.victim;
  const { heal, poison } = state.potions;
  const tone = ink ? "" : "text-gray-900";
  const color = ink ? { color: GAME_THEME.ink } : undefined;

  return (
    <View className="gap-4">
      {victim !== null ? (
        <Text className={`text-center text-lg font-semibold ${tone}`} style={color}>
          {t.wolfTaskWitch.replace("{name}", () => names[victim])}
        </Text>
      ) : null}
      {!heal && !poison ? (
        <Text className={`text-center text-base ${tone}`} style={color}>
          {t.wolfNoPotions}
        </Text>
      ) : null}
      {victim !== null && canHeal(state) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: night.heal }}
          onPress={onHeal}
          className={`rounded-xl py-3 ${night.heal ? "border-4" : "border-2"} ${ink ? "" : "border-gray-300"}`}
          style={ink ? { borderColor: GAME_THEME.ink } : undefined}>
          <Text className={`text-center text-base font-semibold ${tone}`} style={color}>
            {`${night.heal ? "✓ " : ""}${t.wolfHeal.replace("{name}", () => names[victim])}`}
          </Text>
        </Pressable>
      ) : null}
      {poison ? (
        <View className="gap-2">
          <Text className={`text-center text-base font-semibold ${tone}`} style={color}>
            {t.wolfPoison}
          </Text>
          <WolfPicker options={pickOptions(state)} names={names} selected={night.poison} onPick={onPick} note={note} />
        </View>
      ) : null}
    </View>
  );
}
