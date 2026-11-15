import { View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { SCALE_TURN_CHOICES, type ScaleSetup } from "@ptracker/shared/scale-game";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

export function ScaleRulesStep({ value, onChange }: { value: ScaleSetup; onChange: (next: ScaleSetup) => void }) {
  const { t } = useLang();
  return (
    <View className="gap-5">
      <SegmentedToggle
        label={t.scaleTurns}
        hint={t.scaleTurnsHint}
        value={String(value.turns)}
        options={SCALE_TURN_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(n) => onChange({ ...value, turns: Number(n) })}
      />
    </View>
  );
}
