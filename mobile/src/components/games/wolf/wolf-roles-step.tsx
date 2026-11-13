import { Pressable, Switch, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  ROLE_DESC_KEYS,
  ROLE_NAME_KEYS,
  SPECIAL_ROLES,
  maxWolves,
  roleSummary,
  suggestWolves,
  wolfCount,
  type SpecialRole,
  type WolfSetup,
} from "@ptracker/shared/wolf-game";

export function WolfRolesStep({ value, onChange }: { value: WolfSetup; onChange: (next: WolfSetup) => void }) {
  const { t } = useLang();
  const wolves = wolfCount(value);
  const suggested = suggestWolves(value.players.length);
  const max = maxWolves(value.players.length);
  // A count set by hand no longer follows the player count.
  const setWolves = (next: number) => onChange({ ...value, wolves: next });
  const toggle = (role: SpecialRole, on: boolean) =>
    onChange({ ...value, specials: SPECIAL_ROLES.filter((r) => (r === role ? on : value.specials.includes(r))) });
  const stepper = (label: string, sign: string, disabled: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-full border border-gray-200 ${disabled ? "opacity-40" : ""}`}>
      <Text className="text-xl font-bold text-gray-900">{sign}</Text>
    </Pressable>
  );

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text className="text-sm font-medium text-gray-500">{t.wolfWolves}</Text>
        <View className="flex-row items-center gap-4">
          {stepper(t.wolfFewer, "−", wolves <= 1, () => setWolves(wolves - 1))}
          <Text className="w-8 text-center text-2xl font-bold text-gray-900" accessibilityLiveRegion="polite">
            {wolves}
          </Text>
          {stepper(t.wolfMore, "+", wolves >= max, () => setWolves(wolves + 1))}
          <Text className={`text-sm ${wolves === suggested ? "font-semibold text-gray-900" : "text-gray-500"}`}>
            {t.wolfSuggested.replace("{n}", String(suggested))}
          </Text>
        </View>
      </View>

      <View className="gap-3 rounded-xl border border-gray-100 p-4">
        {SPECIAL_ROLES.map((role) => (
          <View key={role} className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-base text-gray-900">{t[ROLE_NAME_KEYS[role]]}</Text>
              <Text className="text-xs text-gray-400">{t[ROLE_DESC_KEYS[role]]}</Text>
            </View>
            <Switch
              accessibilityLabel={t[ROLE_NAME_KEYS[role]]}
              value={value.specials.includes(role)}
              onValueChange={(on) => toggle(role, on)}
            />
          </View>
        ))}
      </View>

      <Text className="text-center text-base font-semibold text-gray-900">{roleSummary(value, t)}</Text>
    </View>
  );
}
