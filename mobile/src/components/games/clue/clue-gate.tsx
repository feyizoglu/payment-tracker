import { Text, View } from "react-native";

import { GAME_THEME } from "@ptracker/shared/clue-game";
import { GameButton } from "@/components/games/game-button";
import { PrimaryButton } from "@/components/ui/primary-button";

// The screen before a secret one: it names who may look and shows nothing secret itself.
export function ClueGate({
  title,
  hint,
  label,
  onReveal,
  onColor = false,
}: {
  title: string;
  hint: string;
  label: string;
  onReveal: () => void;
  /** Rendered on a player's colour: dark text and the game's dark button. */
  onColor?: boolean;
}) {
  const ink = onColor ? { color: GAME_THEME.ink } : undefined;
  return (
    <View className="items-center gap-6 py-16">
      <Text className={`text-center text-2xl font-bold ${onColor ? "" : "text-gray-900"}`} style={ink}>
        {title}
      </Text>
      <Text className={`text-center text-sm ${onColor ? "" : "text-gray-500"}`} style={ink ? [ink, { opacity: 0.8 }] : undefined}>
        {hint}
      </Text>
      <View className="w-full">
        {onColor ? <GameButton label={label} onPress={onReveal} /> : <PrimaryButton label={label} onPress={onReveal} />}
      </View>
    </View>
  );
}
