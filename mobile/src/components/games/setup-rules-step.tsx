import { Switch, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  MAX_IMPOSTERS,
  MAX_TIMER_MINUTES,
  maxImposters,
  type ImposterMode,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

export function SetupRulesStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <View className="gap-5">
      <SegmentedToggle
        label={t.imposterMode}
        value={value.mode}
        options={[
          { value: "no-word", label: t.imposterModeNoWord },
          { value: "similar-word", label: t.imposterModeSimilar },
        ]}
        onChange={(mode) => set({ mode: mode as ImposterMode })}
      />

      {value.mode === "similar-word" ? (
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base text-gray-900">{t.imposterKnowsRole}</Text>
            <Text className="text-xs text-gray-400">{t.imposterKnowsRoleHint}</Text>
          </View>
          <Switch value={value.imposterKnows} onValueChange={(imposterKnows) => set({ imposterKnows })} />
        </View>
      ) : null}

      <SegmentedToggle
        label={t.imposterCount}
        value={String(value.imposterCount)}
        options={Array.from({ length: Math.min(MAX_IMPOSTERS, limit) }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))}
        onChange={(n) => set({ imposterCount: Number(n) })}
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

      <View className="gap-3 rounded-xl border border-gray-100 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base text-gray-900">{t.imposterVoting}</Text>
          <Switch
            value={value.voting}
            onValueChange={(voting) => set({ voting, scoreboard: voting && value.scoreboard })}
          />
        </View>
        <View className={`flex-row items-center justify-between ${value.voting ? "" : "opacity-50"}`}>
          <View>
            <Text className="text-base text-gray-900">{t.imposterScoreboard}</Text>
            {!value.voting ? <Text className="text-xs text-gray-400">{t.imposterScoreboardHint}</Text> : null}
          </View>
          <Switch
            disabled={!value.voting}
            value={value.scoreboard}
            onValueChange={(scoreboard) => set({ scoreboard })}
          />
        </View>
      </View>
    </View>
  );
}
