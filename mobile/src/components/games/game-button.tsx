import { Pressable, Text } from "react-native";

import { GAME_THEME } from "@ptracker/shared/imposter";

// The button of the player-coloured screens: fixed dark with light text, so it reads on
// every player colour. On the dark screens use PrimaryButton.
export function GameButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`items-center rounded-xl px-6 py-3.5 ${disabled ? "opacity-40" : ""}`}
      style={{ backgroundColor: GAME_THEME.bg }}>
      <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
