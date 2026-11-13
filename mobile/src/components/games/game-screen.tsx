import { router, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME } from "@ptracker/shared/imposter";
import { useAppLock } from "@/lib/app-lock-context";
import { gameDarkVars } from "@/lib/game-theme";

// Header with a back action + body, shared by the games screens.
// - `tone="game"`: the fixed dark game look, whatever the app theme is. The status bar is
//   left alone: the game stays mounted under the PIN screen, which follows the app theme.
// - `color`: fills the body with a player's colour.
// - `right`: the screen's own header action. In game mode the exit sits on the left on the
//   games list (which has no back) and on the right on the other screens.
// - `scroll={false}`: a plain body. A held card inside a ScrollView loses the press as soon
//   as the finger drifts.
export function GameScreen({
  title,
  tone = "app",
  color,
  scroll = true,
  right,
  children,
}: {
  title: string;
  tone?: "app" | "game";
  color?: string;
  scroll?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLang();
  const { top, bottom } = useSafeAreaInsets();
  const { lock } = useAppLock();
  const path = usePathname();
  // In game mode the games list is the root: going "back" from it would leave the games.
  const showBack = !(lock.gameMode && path === "/games");
  const game = tone === "game";
  const fill = color ? { backgroundColor: color } : null;
  const exit = (side: "pl-3" | "pr-3") =>
    lock.gameMode && path !== "/app-lock" ? (
      <Pressable onPress={() => router.push("/app-lock")} className={side}>
        <Text className="text-sm text-gray-500">{t.gameModeExit}</Text>
      </Pressable>
    ) : null;
  const spacer = <View className="w-14" />;

  const content = (
    <>
      <View className="flex-row items-center border-b border-gray-100 px-4 py-3">
        {showBack ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(lock.gameMode ? "/games" : "/"))} className="pr-3">
            <Text className="text-sm text-gray-500">‹ {t.back}</Text>
          </Pressable>
        ) : (
          (exit("pr-3") ?? spacer)
        )}
        <Text className="flex-1 text-center text-base font-semibold text-gray-900">{title}</Text>
        {right ?? (showBack ? exit("pl-3") : null) ?? spacer}
      </View>
      {scroll ? (
        <ScrollView
          className="flex-1"
          style={fill}
          contentContainerClassName="gap-4 p-4"
          contentContainerStyle={{ paddingBottom: bottom + 16 }}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 gap-4 p-4" style={[fill, { paddingBottom: bottom + 16 }]}>
          {children}
        </View>
      )}
    </>
  );

  return (
    <KeyboardAvoidingView
      className={game ? "flex-1" : "flex-1 bg-surface"}
      style={[{ paddingTop: top }, game ? { backgroundColor: GAME_THEME.bg } : null]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {game ? (
        <View className="flex-1" style={gameDarkVars}>
          {content}
        </View>
      ) : (
        content
      )}
    </KeyboardAvoidingView>
  );
}
