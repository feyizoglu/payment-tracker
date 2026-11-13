import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, pickOptions, visitTask, type GameState } from "@ptracker/shared/wolf-game";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";

// The open half of a night visit, on the visitor's colour. The table can see it, so it is the
// same for every role: every living player, all alike (and Nobody on the witch lap), and a tap
// moves on to the held result.
export function WolfChoose({
  state,
  onPick,
}: {
  state: GameState;
  /** null is Nobody. */
  onPick: (seat: number | null) => void;
}) {
  const { t } = useLang();
  const night = state.night;
  if (!night || !visitTask(state)) return null;
  const names = state.setup.players;
  const seat = night.order[night.visit];
  const ink = { color: GAME_THEME.ink };

  return (
    <View className="gap-6 py-4">
      <Text className="text-center text-2xl font-bold" style={ink}>
        {names[seat]}
      </Text>
      <Text className="text-center text-xl font-bold" style={ink}>
        {t.wolfChoosePlayer}
      </Text>
      <WolfPicker options={pickOptions(state)} names={names} selected={null} onPick={onPick} />
      {night.lap === "witch" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onPick(null)}
          className="rounded-xl border-2 py-3"
          style={{ borderColor: GAME_THEME.bg }}>
          <Text className="text-center text-base font-semibold" style={ink}>
            {t.wolfNobody}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
