import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { canHeal, pickOptions, type GameState } from "@ptracker/shared/wolf-game";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";

// The witch's choices on the narrator's witch line: only the narrator sees this screen.
export function WolfWitch({
  state,
  onHeal,
  onPick,
  note,
}: {
  state: GameState;
  onHeal: () => void;
  onPick: (seat: number) => void;
  note?: (seat: number) => string;
}) {
  const { t } = useLang();
  const night = state.night;
  if (!night) return null;
  const names = state.setup.players;
  const victim = night.victim;
  const { heal, poison } = state.potions;

  return (
    <View className="gap-4">
      {victim !== null ? (
        <Text className="text-center text-lg font-semibold text-gray-900">
          {t.wolfTaskWitch.replace("{name}", () => names[victim])}
        </Text>
      ) : null}
      {!heal && !poison ? <Text className="text-center text-base text-gray-900">{t.wolfNoPotions}</Text> : null}
      {victim !== null && canHeal(state) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: night.heal }}
          onPress={onHeal}
          className={`rounded-xl border-gray-300 py-3 ${night.heal ? "border-4" : "border-2"}`}>
          <Text className="text-center text-base font-semibold text-gray-900">
            {`${night.heal ? "✓ " : ""}${t.wolfHeal.replace("{name}", () => names[victim])}`}
          </Text>
        </Pressable>
      ) : null}
      {poison ? (
        <View className="gap-2">
          <Text className="text-center text-base font-semibold text-gray-900">{t.wolfPoison}</Text>
          <WolfPicker options={pickOptions(state)} names={names} selected={night.poison} onPick={onPick} note={note} />
        </View>
      ) : null}
    </View>
  );
}
