import { useEffect, useState } from "react";
import { AccessibilityInfo, Text, Vibration, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, POTATO_NEXT_LOCK_MS, POTATO_VIBRATE_MS, fillTemplate } from "@ptracker/shared/hot-potato";
import { GameButton } from "@/components/games/game-button";

// Render it in a GameScreen on the bang colour, and mount it with `key` per bang: it
// vibrates once when it appears.
export function PotatoBang({
  name,
  livesLeft,
  bangAt,
  onNext,
}: {
  name: string;
  livesLeft: number;
  bangAt: number;
  onNext: () => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const status =
    livesLeft === 0
      ? t.potatoOut
      : livesLeft === 1
        ? t.potatoLifeLeft
        : fillTemplate(t.potatoLivesLeft, { n: String(livesLeft) });
  const announcement = `${t.potatoBang} ${name}. ${status}`;
  const ink = { color: GAME_THEME.ink };

  useEffect(() => {
    Vibration.vibrate(POTATO_VIBRATE_MS);
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  // A frantic Pass tap must not skip the bang: Next opens a moment after it.
  useEffect(() => {
    const id = setTimeout(() => setOpen(true), Math.max(0, bangAt + POTATO_NEXT_LOCK_MS - Date.now()));
    return () => clearTimeout(id);
  }, [bangAt]);

  return (
    <View className="flex-1 justify-center gap-10 py-6">
      <View className="items-center gap-3">
        <Text className="text-center text-6xl font-black" style={ink}>
          {t.potatoBang}
        </Text>
        <Text className="text-center text-3xl font-bold" style={ink}>
          {name}
        </Text>
        <Text className="text-center text-xl font-semibold" style={ink}>
          {status}
        </Text>
      </View>
      <GameButton label={t.potatoNext} onPress={onNext} disabled={!open} />
    </View>
  );
}
