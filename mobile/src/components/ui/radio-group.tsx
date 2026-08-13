import { Pressable, Text, View } from "react-native";

import { Field } from "@/components/ui/field";
import type { SelectOption } from "@/components/ui/select-field";

// Stacked single-choice list. Used for the day-change scope question, where both
// options are long sentences and a segmented control would truncate them.
export function RadioGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
}) {
  return (
    <Field label={label}>
      <View className="gap-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              className="flex-row items-center gap-2 py-1.5"
              onPress={() => onChange(option.value)}>
              <Text className={active ? "text-brand" : "text-gray-300"}>{active ? "◉" : "○"}</Text>
              <Text className={`flex-1 text-sm ${active ? "text-gray-900" : "text-gray-500"}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}
