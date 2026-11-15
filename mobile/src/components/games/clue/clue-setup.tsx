import { Pressable, Text, View } from "react-native";

import { localeFor, useLang } from "@ptracker/shared/i18n";
import {
  CLUE_MAX_PLAYERS,
  CLUE_SETUP_ERROR_KEYS,
  CLUE_SETUP_STEPS,
  GAME_THEME,
  clueStepErrors,
  fillTemplate,
  playerColor,
  validateClueSetup,
  type ClueSetup,
} from "@ptracker/shared/clue-game";
import { ClueRulesStep } from "@/components/games/clue/clue-rules-step";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { PrimaryButton } from "@/components/ui/primary-button";

// The setup, one step at a time, like the other games'. The step lives in the parent.
export function ClueSetupWizard({
  value,
  onChange,
  step,
  onStep,
  onStart,
  quickStart,
}: {
  value: ClueSetup;
  onChange: (next: ClueSetup) => void;
  /** Index into CLUE_SETUP_STEPS. */
  step: number;
  onStep: (step: number) => void;
  onStart: () => void;
  /** A game was played on this device before: offer to skip the remaining steps. */
  quickStart: boolean;
}) {
  const { t, lang } = useLang();
  const locale = localeFor(lang);
  const name = CLUE_SETUP_STEPS[step];
  const last = step === CLUE_SETUP_STEPS.length - 1;
  const allErrors = validateClueSetup(value, locale);
  // The last step shows everything that still blocks Start, whichever step it belongs to.
  const errors = last ? allErrors : clueStepErrors(value, name, locale);
  const titles = { players: t.clueStepPlayers, rules: t.clueStepRules };

  return (
    <View className="gap-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-gray-900">{titles[name]}</Text>
        <View
          className="flex-row gap-1.5"
          accessible
          accessibilityLabel={fillTemplate(t.wordStep, { n: String(step + 1), total: String(CLUE_SETUP_STEPS.length) })}>
          {CLUE_SETUP_STEPS.map((s, i) => (
            <View
              key={s}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: GAME_THEME.text, opacity: i === step ? 1 : 0.3 }}
            />
          ))}
        </View>
      </View>

      {name === "players" ? <SetupPlayersStep value={value} onChange={onChange} max={CLUE_MAX_PLAYERS} /> : null}
      {name === "rules" ? <ClueRulesStep value={value} onChange={onChange} /> : null}

      {errors.length > 0 ? (
        <View className="gap-1 rounded-lg bg-amber-50 p-3" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {errors.map((e) => (
            <Text key={e} className="text-sm text-amber-700">
              {t[CLUE_SETUP_ERROR_KEYS[e]]}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center gap-3">
        {step > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onStep(step - 1)}
            className="flex-1 rounded-lg border border-gray-200 py-3">
            <Text className="text-center text-base text-gray-600">{t.back}</Text>
          </Pressable>
        ) : null}
        <View className="flex-1">
          {last ? (
            <PrimaryButton label={t.wordStart} onPress={onStart} disabled={allErrors.length > 0} />
          ) : (
            <PrimaryButton label={t.wordNext} onPress={() => onStep(step + 1)} disabled={errors.length > 0} />
          )}
        </View>
      </View>

      {step === 0 && quickStart && allErrors.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          className="rounded-lg py-3.5"
          style={{ backgroundColor: playerColor(2) }}>
          <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.ink }}>
            {t.wordQuickStart}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
