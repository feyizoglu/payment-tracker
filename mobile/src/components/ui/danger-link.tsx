import { Pressable, Text } from "react-native";

// Destructive secondary action (delete series). Deliberately a text link rather than a
// filled button so it never competes with the form's primary action.
export function DangerLink({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable className={`py-2 ${disabled ? "opacity-50" : ""}`} disabled={disabled} onPress={onPress}>
      <Text className="text-center text-sm font-medium text-red-600">{label}</Text>
    </Pressable>
  );
}
