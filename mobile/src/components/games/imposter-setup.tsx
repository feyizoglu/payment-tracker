import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_LABEL_KEYS,
  MAX_IMPOSTERS,
  MAX_PLAYERS,
  MAX_TIMER_MINUTES,
  SETUP_ERROR_KEYS,
  maxImposters,
  validateSetup,
  type CategoryChoice,
  type ImposterMode,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { Field, inputBoxClass } from "@/components/ui/field";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

export function ImposterSetupForm({
  value,
  onChange,
  onStart,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
  onStart: () => void;
}) {
  const { t } = useLang();
  const errors = validateSetup(value);
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <View className="gap-5">
      <Field label={t.imposterPlayers}>
        <View className="gap-2">
          {value.players.map((name, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <TextInput
                className={`${inputBoxClass} flex-1`}
                value={name}
                onChangeText={(next) => set({ players: value.players.map((p, j) => (j === i ? next : p)) })}
                placeholder={t.imposterPlayerName}
                placeholderTextColor="#9ca3af"
              />
              <Pressable onPress={() => set({ players: value.players.filter((_, j) => j !== i) })} className="px-2 py-2">
                <Text className="text-lg text-gray-400">✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            disabled={value.players.length >= MAX_PLAYERS}
            onPress={() => set({ players: [...value.players, ""] })}
            className={`rounded-lg border border-dashed border-gray-300 py-2.5 ${value.players.length >= MAX_PLAYERS ? "opacity-50" : ""}`}>
            <Text className="text-center text-sm text-gray-500">+ {t.imposterAddPlayer}</Text>
          </Pressable>
        </View>
      </Field>

      <SegmentedToggle
        label={t.imposterMode}
        value={value.mode}
        options={[
          { value: "no-word", label: t.imposterModeNoWord },
          { value: "similar-word", label: t.imposterModeSimilar },
        ]}
        onChange={(mode) => set({ mode: mode as ImposterMode })}
      />

      <SelectField
        label={t.imposterCategory}
        value={value.category}
        options={CATEGORY_CHOICES.map((c) => ({ value: c, label: t[CATEGORY_LABEL_KEYS[c]] }))}
        onChange={(category) => set({ category: category as CategoryChoice })}
      />

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

      {errors.length > 0 ? (
        <View className="gap-1 rounded-lg bg-amber-50 p-3">
          {errors.map((e) => (
            <Text key={e} className="text-sm text-amber-700">
              {t[SETUP_ERROR_KEYS[e]]}
            </Text>
          ))}
        </View>
      ) : null}

      <PrimaryButton label={t.imposterStart} onPress={onStart} disabled={errors.length > 0} />
    </View>
  );
}
