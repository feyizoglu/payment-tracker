import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { ROLE_DESC_KEYS, ROLE_NAME_KEYS, rolesInPlay, type WolfSetup } from "@ptracker/shared/wolf-game";
import { PrimaryButton } from "@/components/ui/primary-button";

// What this game holds, never who holds it. Before every deal it has Deal the cards (and Back
// to the setup); opened from a Rules button during play it only closes.
export function WolfThisGame({
  setup,
  onDeal,
  onBack,
  onClose,
}: {
  setup: WolfSetup;
  onDeal?: () => void;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const { t } = useLang();
  return (
    <View className="gap-5">
      <Text className="text-xl font-bold text-gray-900">{t.wolfThisGame}</Text>
      <View className="gap-2">
        {rolesInPlay(setup).map(({ role, count }) => (
          <View key={role} className="gap-1 rounded-xl border border-gray-100 p-3">
            <Text className="text-base font-semibold text-gray-900">{`${t[ROLE_NAME_KEYS[role]]} ×${count}`}</Text>
            <Text className="text-sm text-gray-500">{t[ROLE_DESC_KEYS[role]]}</Text>
          </View>
        ))}
      </View>
      <View className="gap-1">
        <Text className="text-sm font-medium text-gray-500">{t.wolfHowEnds}</Text>
        <Text className="text-base text-gray-900">{t.wolfVillageWinsRule}</Text>
        <Text className="text-base text-gray-900">{t.wolfWolvesWinRule}</Text>
      </View>
      <Text className="text-sm text-gray-500">{setup.night === "pass" ? t.wolfPassNote : t.wolfNarratorNote}</Text>
      <Text className="text-sm text-gray-500">{t.wolfSilent}</Text>
      {onDeal ? <PrimaryButton label={t.wolfDeal} onPress={onDeal} /> : null}
      {onClose ? <PrimaryButton label={t.wolfClose} onPress={onClose} /> : null}
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} className="py-2">
          <Text className="text-center text-sm text-gray-500">{t.back}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
