import { Pressable, Text, View } from "react-native";

import { localeFor, useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  WHO_SETUP_ERROR_KEYS,
  WHO_SETUP_STEPS,
  playerColor,
  validateWhoSetup,
  whoStepErrors,
  type WhoSetup,
} from "@ptracker/shared/who-game";
import { WhoCardsStep } from "@/components/games/who/who-cards-step";
import { WhoPlayersStep } from "@/components/games/who/who-players-step";
import { WhoRulesStep } from "@/components/games/who/who-rules-step";
import { PrimaryButton } from "@/components/ui/primary-button";

// The setup, one step at a time, like the other games'. The step lives in the parent.
export function WhoSetupWizard({
  value,
  onChange,
  poolSize,
  step,
  onStep,
  onStart,
  quickStart,
}: {
  value: WhoSetup;
  onChange: (next: WhoSetup) => void;
  /** How many cards the setup's kinds, region and level give in the app language. */
  poolSize: number;
  /** Index into WHO_SETUP_STEPS. */
  step: number;
  onStep: (step: number) => void;
  onStart: () => void;
  /** A game was played on this device before: offer to skip the remaining steps. */
  quickStart: boolean;
}) {
  const { t, lang } = useLang();
  const locale = localeFor(lang);
  const name = WHO_SETUP_STEPS[step];
  const last = step === WHO_SETUP_STEPS.length - 1;
  const allErrors = validateWhoSetup(value, locale, poolSize);
  // The last step shows everything that still blocks Start, whichever step it belongs to.
  const errors = last ? allErrors : whoStepErrors(value, name, locale, poolSize);
  const titles = { players: t.whoStepPlayers, cards: t.whoStepCards, rules: t.whoStepRules };

  return (
    <View className="gap-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-gray-900">{titles[name]}</Text>
        <View
          className="flex-row gap-1.5"
          accessible
          accessibilityLabel={t.wordStep.replace("{n}", String(step + 1)).replace("{total}", String(WHO_SETUP_STEPS.length))}>
          {WHO_SETUP_STEPS.map((s, i) => (
            <View
              key={s}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: GAME_THEME.text, opacity: i === step ? 1 : 0.3 }}
            />
          ))}
        </View>
      </View>

      {name === "players" ? <WhoPlayersStep value={value} onChange={onChange} /> : null}
      {name === "cards" ? <WhoCardsStep value={value} onChange={onChange} /> : null}
      {name === "rules" ? <WhoRulesStep value={value} onChange={onChange} /> : null}

      {errors.length > 0 ? (
        <View className="gap-1 rounded-lg bg-amber-50 p-3" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {errors.map((e) => (
            <Text key={e} className="text-sm text-amber-700">
              {t[WHO_SETUP_ERROR_KEYS[e]]}
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
