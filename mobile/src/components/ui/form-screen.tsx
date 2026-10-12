import { router } from "expo-router";
import { ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/ui/primary-button";

// Shared chrome for every modal form: header with a cancel action, error banner,
// scrollable body that stays clear of the keyboard, and a pinned submit bar. The
// screens themselves only supply fields and a submit handler.
export function FormScreen({
  title,
  submitLabel,
  onSubmit,
  busy = false,
  loading = false,
  error,
  cancelLabel,
  footer,
  children,
}: {
  title: string;
  submitLabel: string;
  onSubmit: () => void;
  busy?: boolean;
  loading?: boolean;
  error?: string | null;
  cancelLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { top } = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      style={{ paddingTop: top }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3">
        <Pressable onPress={() => router.back()} disabled={busy}>
          <Text className={`text-sm ${busy ? "text-gray-300" : "text-gray-500"}`}>{cancelLabel}</Text>
        </Pressable>
        <Text className="text-base font-semibold text-gray-900">{title}</Text>
        {/* Balances the cancel action so the title stays centred. */}
        <View className="w-12" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
            {error ? (
              <View className="rounded-lg bg-red-50 p-3">
                <Text className="text-sm text-red-700">{error}</Text>
              </View>
            ) : null}
            {children}
          </ScrollView>

          <View className="gap-2 border-t border-gray-100 p-4">
            {footer}
            <PrimaryButton label={submitLabel} onPress={onSubmit} busy={busy} />
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}
