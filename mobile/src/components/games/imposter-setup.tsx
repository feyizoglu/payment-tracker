import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  SETUP_ERROR_KEYS,
  SETUP_STEPS,
  playerColor,
  stepErrors,
  validateSetup,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { SetupCategoryStep } from "@/components/games/setup-category-step";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { SetupRulesStep } from "@/components/games/setup-rules-step";
import { PrimaryButton } from "@/components/ui/primary-button";

// The setup, one step at a time. The step lives in the parent so this component has no
// state of its own.
export function ImposterSetupWizard({
  value,
  onChange,
  step,
  onStep,
  onStart,
  quickStart,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
  /** Index into SETUP_STEPS. */
  step: number;
  onStep: (step: number) => void;
  onStart: () => void;
  /** A game was played on this device before: offer to skip the remaining steps. */
  quickStart: boolean;
}) {
  const { t } = useLang();
  const name = SETUP_STEPS[step];
  const last = step === SETUP_STEPS.length - 1;
  const allErrors = validateSetup(value);
  // The last step shows everything that still blocks Start, whichever step it belongs to.
  const errors = last ? allErrors : stepErrors(value, name);
  const titles = { players: t.imposterPlayers, category: t.imposterCategory, rules: t.imposterStepRules };

  return (
    <View className="gap-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-gray-900">{titles[name]}</Text>
        <View
          className="flex-row gap-1.5"
          accessible
          accessibilityLabel={t.imposterStep.replace("{n}", String(step + 1)).replace("{total}", String(SETUP_STEPS.length))}>
          {SETUP_STEPS.map((s, i) => (
            <View
              key={s}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: GAME_THEME.text, opacity: i === step ? 1 : 0.3 }}
            />
          ))}
        </View>
      </View>

      {name === "players" ? <SetupPlayersStep value={value} onChange={onChange} /> : null}
      {name === "category" ? <SetupCategoryStep value={value} onChange={onChange} /> : null}
      {name === "rules" ? <SetupRulesStep value={value} onChange={onChange} /> : null}

      {errors.length > 0 ? (
        <View className="gap-1 rounded-lg bg-amber-50 p-3" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {errors.map((e) => (
            <Text key={e} className="text-sm text-amber-700">
              {t[SETUP_ERROR_KEYS[e]]}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center gap-3">
        {step > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => onStep(step - 1)} className="flex-1 rounded-lg border border-gray-200 py-3">
            <Text className="text-center text-base text-gray-600">{t.back}</Text>
          </Pressable>
        ) : null}
        <View className="flex-1">
          {last ? (
            <PrimaryButton label={t.imposterStart} onPress={onStart} disabled={allErrors.length > 0} />
          ) : (
            <PrimaryButton label={t.imposterNext} onPress={() => onStep(step + 1)} disabled={errors.length > 0} />
          )}
        </View>
      </View>

      {step === 0 && quickStart && allErrors.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={onStart} className="rounded-lg py-3.5" style={{ backgroundColor: playerColor(2) }}>
          <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.ink }}>
            {t.imposterQuickStart}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
