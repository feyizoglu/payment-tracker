import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME } from "@ptracker/shared/imposter";
import { GameButton } from "@/components/games/game-button";

// The hand-over screen of the secret vote: the ballot only appears after the named player
// presses the button. It sits on that player's colour, so it sets no themed colours.
export function PassPhone({
  name,
  revealed,
  revealLabel,
  onReveal,
  children,
}: {
  name: string;
  revealed: boolean;
  revealLabel: string;
  onReveal: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  if (revealed) return <View className="items-stretch gap-6 py-6">{children}</View>;
  return (
    <View className="items-center gap-6 py-16">
      <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
        {t.imposterPassTo.replace("{name}", () => name)}
      </Text>
      <Text className="text-center text-sm" style={{ color: GAME_THEME.ink, opacity: 0.8 }}>
        {t.imposterPassHint}
      </Text>
      <View className="w-full">
        <GameButton label={revealLabel} onPress={onReveal} />
      </View>
    </View>
  );
}
