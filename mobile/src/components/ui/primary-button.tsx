import { ActivityIndicator, Pressable, Text } from "react-native";

// Filled action button. `tone="danger"` is the destructive variant (delete); the
// secondary/cancel action is a plain text Pressable inside FormScreen.
export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  tone = "brand",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "brand" | "danger";
}) {
  const inactive = busy || disabled;
  return (
    <Pressable
      className={`flex-row items-center justify-center gap-2 rounded-lg px-6 py-3 ${
        tone === "danger" ? "bg-red-600" : "bg-brand"
      } ${inactive ? "opacity-50" : ""}`}
      disabled={inactive}
      onPress={onPress}>
      {busy ? <ActivityIndicator color="#ffffff" /> : null}
      <Text className="text-center font-semibold text-brand-fg">{label}</Text>
    </Pressable>
  );
}
