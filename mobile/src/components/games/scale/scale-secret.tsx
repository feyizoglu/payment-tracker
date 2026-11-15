import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { fillTemplate, type ScalePair } from "@ptracker/shared/scale-game";
import { ScaleBar, ScaleEnds } from "@/components/games/scale/scale-track";
import { PrimaryButton } from "@/components/ui/primary-button";

// Only the clue giver looks: the pair and the target's band.
export function ScaleSecret({ pair, target, onHide }: { pair: ScalePair; target: number; onHide: () => void }) {
  const { t } = useLang();
  return (
    <View className="flex-1 justify-center gap-5 py-6">
      <Text className="text-center text-base text-gray-500">{t.scaleSecretHint}</Text>
      <ScaleEnds pair={pair} />
      <ScaleBar target={target} label={`${t.scaleTarget}, ${fillTemplate(t.scaleNeedleValue, { n: String(target) })}`} />
      <Text className="text-center text-sm text-gray-500">{t.scaleBandHint}</Text>
      <PrimaryButton label={t.scaleHide} onPress={onHide} />
    </View>
  );
}
