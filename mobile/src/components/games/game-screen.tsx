import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLang } from "@ptracker/shared/i18n";

// Header with a back action + scrolling body, shared by the games screens.
export function GameScreen({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useLang();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: top }}>
      <View className="flex-row items-center border-b border-gray-100 px-4 py-3">
        <Pressable onPress={() => router.back()} className="pr-3">
          <Text className="text-sm text-gray-500">‹ {t.back}</Text>
        </Pressable>
        <Text className="flex-1 text-center text-base font-semibold text-gray-900">{title}</Text>
        <View className="w-14" />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingBottom: bottom + 16 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}
