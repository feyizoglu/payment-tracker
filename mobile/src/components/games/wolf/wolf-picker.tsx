import { Pressable, Text, View } from "react-native";

import { GAME_THEME, playerColor } from "@ptracker/shared/wolf-game";

export interface PickOption {
  seat: number;
  enabled: boolean;
}

// Two columns of buttons, one per player in that player's colour. A check mark, not only the
// border, shows the pick.
export function WolfPicker({
  options,
  names,
  selected,
  onPick,
  note,
}: {
  options: PickOption[];
  names: string[];
  selected: number | null;
  onPick: (seat: number) => void;
  /** A second line under the name, e.g. the role on the narrator's screen. */
  note?: (seat: number) => string;
}) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-2">
      {options.map(({ seat, enabled }) => {
        const chosen = selected === seat;
        return (
          <Pressable
            key={seat}
            accessibilityRole="button"
            accessibilityState={{ disabled: !enabled, selected: chosen }}
            disabled={!enabled}
            onPress={() => onPick(seat)}
            className={`rounded-xl py-3 ${chosen ? "border-4" : "border-2"} ${enabled ? "" : "opacity-40"}`}
            style={{
              width: "48.5%",
              backgroundColor: playerColor(seat),
              borderColor: chosen ? GAME_THEME.text : GAME_THEME.bg,
            }}>
            <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.ink }}>
              {`${chosen ? "✓ " : ""}${names[seat]}`}
            </Text>
            {note ? (
              <Text className="text-center text-xs" style={{ color: GAME_THEME.ink }}>
                {note(seat)}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
