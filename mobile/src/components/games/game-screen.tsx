import { router, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLang } from "@ptracker/shared/i18n";
import { useAppLock } from "@/lib/app-lock-context";

// Header with a back action + scrolling body, shared by the games screens.
export function GameScreen({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useLang();
  const { top, bottom } = useSafeAreaInsets();
  const { lock } = useAppLock();
  const path = usePathname();
  // In game mode the games list is the root: going "back" from it would leave the games.
  const showBack = !(lock.gameMode && path === "/games");
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      style={{ paddingTop: top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="flex-row items-center border-b border-gray-100 px-4 py-3">
        {showBack ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(lock.gameMode ? "/games" : "/"))} className="pr-3">
            <Text className="text-sm text-gray-500">‹ {t.back}</Text>
          </Pressable>
        ) : (
          <View className="w-14" />
        )}
        <Text className="flex-1 text-center text-base font-semibold text-gray-900">{title}</Text>
        {lock.gameMode && path !== "/app-lock" ? (
          <Pressable onPress={() => router.push("/app-lock")} className="pl-3">
            <Text className="text-sm text-gray-500">{t.gameModeExit}</Text>
          </Pressable>
        ) : (
          <View className="w-14" />
        )}
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingBottom: bottom + 16 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
