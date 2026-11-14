import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, fillTemplate } from "@ptracker/shared/hot-potato";
import { GameButton } from "@/components/games/game-button";

// Render on the starter's colour. The task stays hidden until Start lights the fuse.
export function PotatoReady({ name, onStart }: { name: string; onStart: () => void }) {
  const { t } = useLang();

  return (
    <View className="flex-1 justify-center gap-6 py-6">
      <Text className="text-center text-3xl font-bold" style={{ color: GAME_THEME.ink }}>
        {fillTemplate(t.potatoStarts, { name })}
      </Text>
      <Text className="text-center text-sm" style={{ color: GAME_THEME.ink, opacity: 0.8 }}>
        {t.potatoReadyHint}
      </Text>
      <GameButton label={t.potatoStart} onPress={onStart} />
    </View>
  );
}
