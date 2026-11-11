import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { PrimaryButton } from "@/components/ui/primary-button";

export function PassPhone({
  name,
  revealed,
  revealLabel,
  onReveal,
  children,
}: {
  name: string;
  revealed: boolean;
  revealLabel: string;
  onReveal: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  if (revealed) return <View className="items-stretch gap-6 py-6">{children}</View>;
  return (
    <View className="items-center gap-6 py-16">
      <Text className="text-center text-2xl font-bold text-gray-900">{t.imposterPassTo.replace("{name}", name)}</Text>
      <Text className="text-center text-sm text-gray-500">{t.imposterPassHint}</Text>
      <View className="w-full">
        <PrimaryButton label={revealLabel} onPress={onReveal} />
      </View>
    </View>
  );
}
