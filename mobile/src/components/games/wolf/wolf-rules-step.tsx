import { Switch, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { MAX_TIMER_MINUTES, type NightMode, type WolfSetup } from "@ptracker/shared/wolf-game";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

export function WolfRulesStep({ value, onChange }: { value: WolfSetup; onChange: (next: WolfSetup) => void }) {
  const { t } = useLang();
  const set = (patch: Partial<WolfSetup>) => onChange({ ...value, ...patch });

  return (
    <View className="gap-5">
      <SegmentedToggle
        label={t.wolfNight}
        value={value.night}
        options={[
          { value: "pass", label: t.wolfNightPass },
          { value: "narrator", label: t.wolfNightNarrator },
        ]}
        onChange={(night) => set({ night: night as NightMode })}
        hint={value.night === "narrator" ? t.wolfNightNarratorHint : undefined}
      />

      <SelectField
        label={t.imposterTimer}
        value={String(value.timerMinutes)}
        options={Array.from({ length: MAX_TIMER_MINUTES + 1 }, (_, m) => ({
          value: String(m),
          label: m === 0 ? t.imposterTimerOff : t.imposterMinutes.replace("{n}", String(m)),
        }))}
        onChange={(m) => set({ timerMinutes: Number(m) })}
      />

      <View className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-100 p-4">
        <Text className="flex-1 text-base text-gray-900">{t.wolfShowRoles}</Text>
        <Switch value={value.showRoles} onValueChange={(showRoles) => set({ showRoles })} />
      </View>
    </View>
  );
}
