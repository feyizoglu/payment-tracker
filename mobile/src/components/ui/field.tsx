import { ReactNode } from "react";
import { Text, View } from "react-native";

// Label + control + optional hint. Every form control in ui/ wraps its input in this
// so labels, spacing, and hint styling stay identical across screens.
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1">
      <Text className="text-xs font-medium text-gray-500">{label}</Text>
      {children}
      {hint ? <Text className="text-xs text-gray-400">{hint}</Text> : null}
    </View>
  );
}

// Shared border/padding for anything that looks like an input box (TextInput, and the
// Pressables that open the select and date pickers).
export const inputBoxClass =
  "rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900";
