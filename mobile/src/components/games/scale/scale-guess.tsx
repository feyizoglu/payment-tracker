import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import type { ScalePair } from "@ptracker/shared/scale-game";
import { ScaleNeedle } from "@/components/games/scale/scale-needle";
import { ScaleEnds } from "@/components/games/scale/scale-track";
import { PrimaryButton } from "@/components/ui/primary-button";

// The team moves the needle. Render in a GameScreen with `scroll={false}`: a scroll view would
// take the drag.
export function ScaleGuess({
  pair,
  team,
  color,
  needle,
  confirming,
  onMove,
  onLock,
}: {
  pair: ScalePair;
  team: string;
  color: string;
  needle: number;
  /** Lock in was tapped once: the next tap locks the needle. */
  confirming: boolean;
  onMove: (needle: number) => void;
  onLock: () => void;
}) {
  const { t } = useLang();
  return (
    <View className="flex-1 justify-center gap-5 py-6">
      <Text className="text-center text-2xl font-bold" style={{ color }}>
        {team}
      </Text>
      <Text className="text-center text-base text-gray-500">{t.scaleGuessHint}</Text>
      <ScaleEnds pair={pair} />
      <ScaleNeedle value={needle} onMove={onMove} />
      <PrimaryButton label={confirming ? t.scaleConfirm : t.scaleLockIn} onPress={onLock} />
    </View>
  );
}
